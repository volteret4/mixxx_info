import os
import time

import musicbrainzngs
import pylast
import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from pathlib import Path

from .db import Song
from . import wikipedia, links, reviews, covers

musicbrainzngs.set_useragent("mixxx_info", "0.1", "viciosmusicales@gmail.com")

_DISCOGS_HEADERS = {"User-Agent": "mixxx_info/0.1 +viciosmusicales@gmail.com"}
_WHOSAMPLED_HEADERS = {"User-Agent": "Mozilla/5.0"}


# ── MusicBrainz ──────────────────────────────────────────────────────────────

def _best_release(releases: list) -> dict:
    """Pick the most canonical release: prefer Official, then Album type."""
    status_rank = {"Official": 0, "Promotion": 1, "Bootleg": 2}
    return min(
        releases,
        key=lambda r: (status_rank.get(r.get("status", ""), 9), r.get("date", "9999")),
        default={},
    )


def _mb_enrich(title: str, artist: str) -> dict:
    try:
        result = musicbrainzngs.search_recordings(recording=title, artist=artist, limit=1)
        recordings = result.get("recording-list", [])
        if not recordings:
            return {}
        mb_id = recordings[0].get("id")
        if not mb_id:
            return {}

        # Call 1: recording details — artist tags, recording tags, ISRC, releases
        details = musicbrainzngs.get_recording_by_id(
            mb_id,
            includes=["artists", "artist-credits", "releases", "tags", "isrcs", "artist-rels"],
        )
        rec = details.get("recording", {})
        data: dict = {"musicbrainz_id": mb_id}

        # ISRC
        isrcs = rec.get("isrc-list", [])
        if isrcs:
            data["isrc"] = isrcs[0] if isinstance(isrcs[0], str) else isrcs[0].get("id")

        # Recording-level tags (sorted by vote count, top 10)
        rec_tags = sorted(rec.get("tag-list", []), key=lambda t: int(t.get("count", 0)), reverse=True)
        if rec_tags:
            data["mb_tags"] = [t["name"] for t in rec_tags[:10]]

        # Main artist's tags from artist-credit (richer than recording tags)
        artist_credit = rec.get("artist-credit", [])
        if artist_credit and isinstance(artist_credit[0], dict):
            a_tags = artist_credit[0].get("artist", {}).get("tag-list", [])
            a_tags_sorted = sorted(a_tags, key=lambda t: int(t.get("count", 0)), reverse=True)
            if a_tags_sorted:
                data["artist_mb_tags"] = [t["name"] for t in a_tags_sorted[:15]]

        # Artist relationships at recording level (producers, engineers — sparse in MB)
        producers_mb, engineers_mb = [], []
        for rel_group in (rec.get("relation-list") or []):
            if not isinstance(rel_group, dict) or rel_group.get("target-type") != "artist":
                continue
            for rel in rel_group.get("relation", []):
                rel_type = rel.get("type", "").lower()
                name = rel.get("artist", {}).get("name", "")
                if not name:
                    continue
                if "producer" in rel_type:
                    producers_mb.append(name)
                elif rel_type in ("engineer", "mix", "mastering"):
                    engineers_mb.append(name)
        if producers_mb:
            data["producers"] = producers_mb
        if engineers_mb:
            data["engineers"] = engineers_mb

        # Pick best release then call for label + release-group type
        releases = rec.get("release-list", [])
        best = _best_release(releases)
        release_mbid = best.get("id")
        data["year"] = (best.get("date") or "")[:4] or None

        if release_mbid:
            data["musicbrainz_release_id"] = release_mbid
            time.sleep(1.0)  # MB rate limit between calls
            rel_details = musicbrainzngs.get_release_by_id(
                release_mbid, includes=["labels", "release-groups"]
            )
            rel = rel_details.get("release", {})
            data["release_status"] = rel.get("status")
            data["release_country"] = rel.get("country")

            label_info = rel.get("label-info-list", [])
            if label_info:
                data["label"] = label_info[0].get("label", {}).get("name")
                data["catalog_number"] = label_info[0].get("catalog-number")

            rg = rel.get("release-group", {})
            data["release_type"] = rg.get("primary-type")

        return {k: v for k, v in data.items() if v is not None}
    except Exception:
        return {}


# ── Discogs ───────────────────────────────────────────────────────────────────

def _discogs_enrich(title: str, artist: str, token: str) -> dict:
    try:
        search_resp = requests.get(
            "https://api.discogs.com/database/search",
            params={"q": f"{artist} {title}", "type": "release", "token": token},
            headers=_DISCOGS_HEADERS,
            timeout=10,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get("results", [])
        if not results:
            return {}

        rel_resp = requests.get(
            f"https://api.discogs.com/releases/{results[0]['id']}",
            params={"token": token},
            headers=_DISCOGS_HEADERS,
            timeout=10,
        )
        rel_resp.raise_for_status()
        rel = rel_resp.json()

        producers, engineers, musicians = [], [], []
        for credit in rel.get("extraartists", []):
            role = credit.get("role", "").lower()
            name = credit["name"]
            if "producer" in role:
                producers.append(name)
            elif "engineer" in role or "master" in role or "mix" in role:
                engineers.append(name)
            else:
                musicians.append(name)

        labels = rel.get("labels", [])

        # Discogs artist profile (bio, realname, aliases)
        artist_data = {}
        release_artists = rel.get("artists", [])
        if release_artists:
            discogs_artist_id = str(release_artists[0].get("id", ""))
            if discogs_artist_id:
                try:
                    a_resp = requests.get(
                        f"https://api.discogs.com/artists/{discogs_artist_id}",
                        params={"token": token},
                        headers=_DISCOGS_HEADERS,
                        timeout=10,
                    )
                    a_resp.raise_for_status()
                    a = a_resp.json()
                    artist_data = {
                        "artist_real_name": a.get("realname") or None,
                        "artist_profile": a.get("profile") or None,
                        "artist_aliases": [m["name"] for m in a.get("aliases", [])] or None,
                    }
                except Exception:
                    pass

        return {
            "discogs_release_id": str(results[0]["id"]),
            "label": labels[0]["name"] if labels else None,
            "producers": producers or None,
            "engineers": engineers or None,
            "session_musicians": musicians or None,
            **artist_data,
        }
    except Exception:
        return {}


# ── Last.fm ───────────────────────────────────────────────────────────────────

def _lastfm_enrich(title: str, artist: str, api_key: str) -> dict:
    try:
        network = pylast.LastFMNetwork(api_key=api_key)
        track = network.get_track(artist, title)
        return {"lastfm_listeners": track.get_listener_count()}
    except Exception:
        return {}


# ── WhoSampled (scraper) ──────────────────────────────────────────────────────

def _whosampled_enrich(title: str, artist: str) -> dict:
    """Fragile scraper — WhoSampled has no public API and may block at any time."""
    try:
        query = f"{artist} {title}".replace(" ", "+")
        resp = requests.get(
            f"https://www.whosampled.com/search/tracks/?q={query}",
            headers=_WHOSAMPLED_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        link = soup.select_one(".listEntry .trackName a")
        if not link:
            return {}

        time.sleep(1.5)  # polite crawl delay between requests
        resp2 = requests.get(
            "https://www.whosampled.com" + link["href"],
            headers=_WHOSAMPLED_HEADERS,
            timeout=10,
        )
        soup2 = BeautifulSoup(resp2.text, "html.parser")

        def parse_section(heading: str) -> list[dict]:
            h3 = soup2.find("h3", string=lambda t: t and heading in t)
            if not h3:
                return []
            entries = []
            for li in h3.find_next("ul").select("li")[:20]:
                tags = li.select("a")
                if len(tags) >= 2:
                    entries.append({"title": tags[0].get_text(strip=True), "artist": tags[1].get_text(strip=True)})
            return entries

        return {
            "samples": parse_section("Contains samples of") or None,
            "sampled_by": parse_section("Was sampled in") or None,
        }
    except Exception:
        return {}


# ── Wikipedia ────────────────────────────────────────────────────────────────

def _wikipedia_enrich(song: Song) -> dict:
    data: dict = {}
    a = song.artist or ""

    # Artist Wikipedia — try MB first, fall back to direct search
    if not song.artist_wikipedia_url:
        wiki_url = None
        if song.musicbrainz_id:
            # Use the recording's artist MBID if we can get it — for now search directly
            pass
        if not wiki_url:
            wiki_url = wikipedia.search(a)
        if wiki_url:
            data["artist_wikipedia_url"] = wiki_url
            content = wikipedia.get_content(wiki_url)
            if content:
                data["artist_wikipedia_content"] = content

    # Album Wikipedia
    if not song.album_wikipedia_url and song.album:
        wiki_url = wikipedia.search(f"{a} {song.album} album")
        if wiki_url:
            data["album_wikipedia_url"] = wiki_url

    return data


# ── Public API ────────────────────────────────────────────────────────────────

def enrich_song(song: Song, session: Session):
    t, a = song.title or "", song.artist or ""

    def _apply(d: dict):
        for key, val in d.items():
            if val is not None and getattr(song, key, None) is None:
                setattr(song, key, val)

    if not song.musicbrainz_id:
        try:
            _apply(_mb_enrich(t, a))
        except Exception:
            pass

    if not song.discogs_release_id:
        try:
            _apply(_discogs_enrich(t, a, os.environ["DISCOGS_TOKEN"]))
        except Exception:
            pass

    # Cover fetch after MB/Discogs so their IDs are available
    if not song.cover_art_path:
        try:
            path, url = covers.fetch_cover(
                artist=a,
                album=song.album or "",
                covers_dir=Path("covers"),
                mb_release_id=song.musicbrainz_release_id,
                discogs_release_id=song.discogs_release_id,
                discogs_token=os.environ.get("DISCOGS_TOKEN"),
            )
            if path:
                song.cover_art_path = path
                song.cover_art_url = url
        except Exception:
            pass

    if not song.lastfm_listeners:
        try:
            _apply(_lastfm_enrich(t, a, os.environ["LASTFM_API_KEY"]))
        except Exception:
            pass

    if song.samples is None and song.sampled_by is None:
        try:
            _apply(_whosampled_enrich(t, a))
        except Exception:
            pass

    if not song.artist_wikipedia_url:
        try:
            _apply(_wikipedia_enrich(song))
        except Exception:
            pass

    if not song.youtube_url:
        try:
            _apply(links.enrich_links(a, t))
        except Exception:
            pass

    if not song.metacritic_score or not song.aoty_score or song.review_links is None:
        try:
            _apply(reviews.enrich_reviews(a, song.album or t))
        except Exception:
            pass

    session.commit()
