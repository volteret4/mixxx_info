import json
import os
from pathlib import Path

import click
from sopsdotenv import load_sops_env
from sqlalchemy.orm import Session

from src.db import get_engine, init_db, upsert_song, Song
from src.enricher import enrich_song
from src.gemini import enrich_with_gemini
from src.scanner import scan_library, MUSIC_ROOT
from src.covers import fetch_cover
from src import reviews as _reviews

load_sops_env()


@click.group()
def cli():
    pass


@cli.command()
@click.option("--root", default=str(MUSIC_ROOT), show_default=True, help="Music library root path.")
@click.option("--output", default="library.json", show_default=True, help="Output file.")
@click.option("--fingerprint-all", is_flag=True, help="Compute AcoustID fingerprint for every file (slow).")
def scan(root, output, fingerprint_all):
    """Phase A: Walk library, extract ID3 tags, fingerprint untagged files."""
    click.echo(f"Scanning {root} ...")
    tracks, skipped = scan_library(Path(root), fingerprint_all=fingerprint_all)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(tracks, f, indent=2, ensure_ascii=False)
    click.echo(f"{len(tracks)} tracks → {output}")
    if skipped:
        click.echo(f"Skipped {len(skipped)} unreadable files:")
        for p in skipped:
            click.echo(f"  {p}")


@cli.command()
@click.option("--input", "input_file", default="library.json", show_default=True)
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--limit", default=0, help="Max tracks to process (0 = all).")
@click.option("--skip-whosampled", is_flag=True, help="Skip WhoSampled scraping.")
def enrich(input_file, db, limit, skip_whosampled):
    """Phase B: Enrich via MusicBrainz, Discogs, Last.fm, WhoSampled."""
    engine = get_engine(db)
    init_db(engine)

    with open(input_file, encoding="utf-8") as f:
        tracks = json.load(f)
    if limit:
        tracks = tracks[:limit]

    _reviews.start_browser()
    try:
        with Session(engine) as session:
            for i, track in enumerate(tracks, 1):
                song = upsert_song(session, track)
                label = f"{song.artist or '?'} — {song.title or song.file_path}"
                click.echo(f"[{i}/{len(tracks)}] {label}")
                enrich_song(song, session)
    finally:
        _reviews.stop_browser()

    click.echo("Done.")


@cli.command("ai-enrich")
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--limit", default=0, help="Max tracks to process (0 = all).")
def ai_enrich(db, limit):
    """Phase C: Fill metadata gaps with Gemini AI."""
    engine = get_engine(db)

    with Session(engine) as session:
        q = session.query(Song).filter(Song.gemini_context.is_(None))
        songs = q.limit(limit).all() if limit else q.all()
        total = len(songs)
        for i, song in enumerate(songs, 1):
            label = f"{song.artist or '?'} — {song.title or song.file_path}"
            click.echo(f"[{i}/{total}] {label}")
            enrich_with_gemini(song, session)

    click.echo("Done.")


@cli.command()
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--covers-dir", default="covers", show_default=True)
@click.option("--limit", default=0, help="Max albums to process (0 = all).")
def download_covers(db, covers_dir, limit):
    """Download cover art for albums that don't have one yet."""
    from pathlib import Path
    engine = get_engine(db)
    covers_path = Path(covers_dir)
    token = os.environ.get("DISCOGS_TOKEN", "")

    with Session(engine) as session:
        q = session.query(Song).filter(Song.cover_art_path.is_(None))
        songs = q.limit(limit).all() if limit else q.all()
        seen_albums: set[str] = set()
        processed = 0
        for song in songs:
            key = f"{song.artist}:{song.album}"
            if key in seen_albums:
                continue
            seen_albums.add(key)
            label = f"{song.artist or '?'} — {song.album or '?'}"
            click.echo(f"  {label}")
            path, url = fetch_cover(
                artist=song.artist or "",
                album=song.album or "",
                covers_dir=covers_path,
                mb_release_id=song.musicbrainz_release_id,
                discogs_release_id=song.discogs_release_id,
                discogs_token=token,
            )
            if path:
                session.query(Song).filter(
                    Song.artist == song.artist, Song.album == song.album
                ).update({"cover_art_path": path, "cover_art_url": url})
                session.commit()
                processed += 1

    click.echo(f"Done. {processed} covers downloaded to {covers_dir}/.")


@cli.command("sync-mixxx")
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--mixxx-db", default=str(Path.home() / ".mixxx/mixxxdb.sqlite"), show_default=True)
@click.option("--dry-run", is_flag=True)
def sync_mixxx(db, mixxx_db, dry_run):
    """Copy BPM and key from Mixxx's analysis into library.db where missing."""
    import sqlite3

    mixxx = sqlite3.connect(mixxx_db)
    mixxx.row_factory = sqlite3.Row
    mixxx_rows = mixxx.execute(
        "SELECT tl.location, l.bpm, l.key "
        "FROM library l JOIN track_locations tl ON l.location = tl.id "
        "WHERE l.mixxx_deleted = 0 AND (l.bpm > 0 OR (l.key != '' AND l.key IS NOT NULL))"
    ).fetchall()
    mixxx.close()

    # path → {bpm, key}
    mixxx_data = {
        r["location"]: {"bpm": r["bpm"] or None, "key_signature": r["key"] or None}
        for r in mixxx_rows
    }

    engine = get_engine(db)
    updated = skipped = 0
    with Session(engine) as session:
        songs = session.query(Song).filter(
            (Song.bpm.is_(None)) | (Song.key_signature.is_(None))
        ).all()
        click.echo(f"{len(songs)} songs missing BPM or key in library.db")
        for song in songs:
            mx = mixxx_data.get(song.file_path)
            if not mx:
                skipped += 1
                continue
            changes = {}
            if song.bpm is None and mx["bpm"]:
                changes["bpm"] = round(mx["bpm"], 2)
            if song.key_signature is None and mx["key_signature"]:
                changes["key_signature"] = mx["key_signature"]
            if not changes:
                skipped += 1
                continue
            label = f"{song.artist or '?'} — {song.title or song.file_path}"
            click.echo(f"  {'DRY' if dry_run else 'OK '} {label}: {changes}")
            if not dry_run:
                for k, v in changes.items():
                    setattr(song, k, v)
            updated += 1
        if not dry_run:
            session.commit()

    verb = "Would update" if dry_run else "Updated"
    click.echo(f"\n{verb}: {updated}  |  not in Mixxx: {skipped}")


@cli.command()
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--artist", default=None)
@click.option("--title", default=None)
@click.option("--taste", default=None, help="Filter by folder_taste.")
@click.option("--limit", default=20, show_default=True)
def query(db, artist, title, taste, limit):
    """Quick CLI query against the local database."""
    engine = get_engine(db)
    with Session(engine) as session:
        q = session.query(Song)
        if artist:
            q = q.filter(Song.artist.ilike(f"%{artist}%"))
        if title:
            q = q.filter(Song.title.ilike(f"%{title}%"))
        if taste:
            q = q.filter(Song.folder_taste == taste)
        songs = q.limit(limit).all()
        for s in songs:
            click.echo(f"{s.folder_taste:20} {s.artist or '?':30} {s.title or '?'}")
    click.echo(f"{len(songs)} results.")


@cli.command("enrich-credits")
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--limit", default=0, help="Max tracks to process (0 = all).")
@click.option("--dry-run", is_flag=True, help="Print what would be updated without writing.")
def enrich_credits(db, limit, dry_run):
    """Re-fetch detailed credits (producers, engineers, session musicians) from Discogs.

    Targets songs that already have a discogs_release_id but are missing one or more
    credit fields. Also retries songs with no discogs_release_id by searching Discogs.
    Run after `enrich` to fill the credits graph.
    """
    import requests as _req
    import time

    token = os.environ.get("DISCOGS_TOKEN", "")
    if not token:
        click.echo("DISCOGS_TOKEN not set — load .encrypted.env first.", err=True)
        return

    headers = {
        "User-Agent": "mixxx_info/0.1 +viciosmusicales@gmail.com",
        "Authorization": f"Discogs token={token}",
    }

    engine = get_engine(db)
    init_db(engine)

    with Session(engine) as session:
        # Priority 1: have release ID but missing credits
        q_known = session.query(Song).filter(
            Song.discogs_release_id.isnot(None),
            (Song.producers.is_(None) | Song.engineers.is_(None)),
        )
        # Priority 2: missing release ID entirely (try searching)
        q_unknown = session.query(Song).filter(
            Song.discogs_release_id.is_(None),
            (Song.producers.is_(None) | Song.engineers.is_(None)),
        )

        known_songs  = q_known.limit(limit).all()  if limit else q_known.all()
        unknown_songs = q_unknown.limit(max(0, limit - len(known_songs))).all() if limit else q_unknown.all()
        songs = known_songs + unknown_songs

    click.echo(f"Processing {len(songs)} tracks ({len(known_songs)} with known Discogs ID, {len(unknown_songs)} to search)…")

    updated = 0
    with Session(engine) as session:
        for i, song in enumerate(songs, 1):
            label = f"{song.artist or '?'} — {song.title or '?'}"
            click.echo(f"[{i}/{len(songs)}] {label}")
            time.sleep(1.0)

            release_id = song.discogs_release_id

            # Search Discogs if we don't have the release ID yet
            if not release_id:
                try:
                    sr = _req.get(
                        "https://api.discogs.com/database/search",
                        params={"q": f"{song.artist} {song.title}", "type": "release"},
                        headers=headers, timeout=10,
                    )
                    results = sr.json().get("results", []) if sr.status_code == 200 else []
                    if results:
                        release_id = str(results[0]["id"])
                except Exception as e:
                    click.echo(f"  Search error: {e}")
                    continue

            if not release_id:
                click.echo("  No Discogs release found — skipping")
                continue

            try:
                rr = _req.get(
                    f"https://api.discogs.com/releases/{release_id}",
                    headers=headers, timeout=10,
                )
                if rr.status_code != 200:
                    click.echo(f"  HTTP {rr.status_code}")
                    continue
                rel = rr.json()
            except Exception as e:
                click.echo(f"  Fetch error: {e}")
                continue

            producers, engineers, musicians = [], [], []
            for credit in rel.get("extraartists", []):
                role = credit.get("role", "").lower()
                name = credit.get("name", "").strip()
                if not name:
                    continue
                if "producer" in role:
                    producers.append(name)
                elif any(k in role for k in ("engineer", "master", "mix", "record")):
                    engineers.append(name)
                else:
                    musicians.append(name)

            # Also scan track-level credits
            for track in rel.get("tracklist", []):
                for credit in track.get("extraartists", []):
                    role = credit.get("role", "").lower()
                    name = credit.get("name", "").strip()
                    if not name:
                        continue
                    if "producer" in role and name not in producers:
                        producers.append(name)
                    elif any(k in role for k in ("engineer", "master", "mix")) and name not in engineers:
                        engineers.append(name)

            changes = {}
            if producers and not song.producers:
                changes["producers"] = producers
            if engineers and not song.engineers:
                changes["engineers"] = engineers
            if musicians and not song.session_musicians:
                changes["session_musicians"] = musicians
            if release_id and not song.discogs_release_id:
                changes["discogs_release_id"] = release_id

            if changes:
                click.echo(f"  → producers={len(producers)} engineers={len(engineers)} musicians={len(musicians)}")
                if not dry_run:
                    s = session.get(Song, song.id)
                    for k, v in changes.items():
                        setattr(s, k, v)
                    session.commit()
                updated += 1
            else:
                click.echo("  (no new credits found)")

    click.echo(f"Done. {updated} tracks updated.")


@cli.command("prune-stale")
@click.option("--db", default="sqlite:///library.db", show_default=True)
@click.option("--dry-run", is_flag=True, help="Show what would be deleted without deleting.")
def prune_stale(db, dry_run):
    """Remove DB entries whose audio file no longer exists on disk."""
    from pathlib import Path as _Path
    engine = get_engine(db)
    with Session(engine) as session:
        songs = session.query(Song).all()
        stale = [s for s in songs if not _Path(s.file_path).exists()]
        click.echo(f"Total: {len(songs)}  |  Missing on disk: {len(stale)}")
        if not stale:
            click.echo("Nothing to do.")
            return
        for s in stale[:5]:
            click.echo(f"  {'DRY' if dry_run else 'DEL'} [{s.folder_taste}] {s.artist or '?'} — {s.title or s.file_path[-50:]}")
        if len(stale) > 5:
            click.echo(f"  … and {len(stale) - 5} more")
        if not dry_run:
            for s in stale:
                session.delete(s)
            session.commit()
            click.echo(f"Deleted {len(stale)} stale entries.")
        else:
            click.echo(f"Dry run — nothing deleted. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    cli()
