"""
FastAPI backend for the mixxx_info music library browser.

Run: uvicorn api.main:app --reload --port 8000
"""
import mimetypes
import os
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

import requests as _req

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import or_, func, String
from sqlalchemy.orm import Session

from src.db import get_engine, init_db, Song, Playlist, PlaylistTrack

DB_URL = "sqlite:///library.db"
COVERS_DIR = Path("covers")

engine = get_engine(DB_URL)
init_db(engine)

app = FastAPI(title="mixxx_info")

# ── Panel de configuración (⚙) ───────────────────────────────────────────────
# Mismo patrón que el resto de apps. El botón vive en web/ (React, servido
# por nginx), pero nginx ya proxea /api/ hacia este backend — por eso las
# rutas van aquí y no en el contenedor de nginx (que no puede leer/escribir
# archivos ni ejecutar Python).
SETTINGS_ENV_PATH = Path(__file__).parent.parent / ".env"
SETTINGS_PASSWORD = os.environ.get("SETTINGS_PASSWORD", "")
VARS_SPEC = [
    {"name": "GEMINI_API_KEY", "secret": True, "help": "API key de Gemini (enriquecido de metadatos)"},
    {"name": "LASTFM_API_KEY", "secret": True, "help": "API key de Last.fm"},
    {"name": "DISCOGS_TOKEN", "secret": True, "help": "Token de Discogs"},
    {"name": "SEARXNG_URL", "secret": False, "default": "http://localhost:8485", "help": "URL de la instancia SearXNG (búsqueda de reseñas)"},
]
_HAS_SECRETS = any(v.get("secret") for v in VARS_SPEC)


def _read_env_file(path):
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
                v = v[1:-1]
            values[k.strip()] = v
    return values


def _write_env_file(path, updates):
    lines = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    seen = set()
    out = []
    for line in lines:
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k = s.split("=", 1)[0].strip()
            if k in updates:
                out.append(f"{k}={updates[k]}\n")
                seen.add(k)
                continue
        out.append(line)
    for k, v in updates.items():
        if k not in seen:
            if out and not out[-1].endswith("\n"):
                out[-1] += "\n"
            out.append(f"{k}={v}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(out)


def _current_value(spec):
    file_vals = _read_env_file(SETTINGS_ENV_PATH)
    if spec["name"] in file_vals:
        return file_vals[spec["name"]]
    return os.environ.get(spec["name"], spec.get("default", ""))


def _check_auth(password):
    if not SETTINGS_PASSWORD:
        return not _HAS_SECRETS
    return password == SETTINGS_PASSWORD


@app.post("/api/settings")
async def api_settings(request: Request):
    d = await request.json() if await request.body() else {}
    password = d.get("password") or ""
    requires = bool(SETTINGS_PASSWORD) or _HAS_SECRETS
    authorized = _check_auth(password)
    if requires and not authorized:
        error = "Contraseña incorrecta" if password else None
        if not SETTINGS_PASSWORD:
            error = "Este servicio tiene credenciales pero no hay SETTINGS_PASSWORD configurada. Añádela al .env y reinicia el contenedor."
        return {"requires_password": True, "authorized": False, "error": error}
    vars_out = [
        {"name": v["name"], "value": _current_value(v), "secret": v["secret"], "help": v.get("help", "")}
        for v in VARS_SPEC
    ]
    return {"requires_password": requires, "authorized": True, "vars": vars_out}


@app.post("/api/settings/save")
async def api_settings_save(request: Request):
    d = await request.json() if await request.body() else {}
    if not _check_auth(d.get("password") or ""):
        return JSONResponse({"error": "Contraseña incorrecta"}, status_code=403)
    known = {v["name"] for v in VARS_SPEC}
    updates = {k: v for k, v in (d.get("values") or {}).items() if k in known}
    if not updates:
        return JSONResponse({"error": "Nada que guardar"}, status_code=400)
    _write_env_file(SETTINGS_ENV_PATH, updates)
    return {"ok": True, "message": "Guardado. Reinicia el contenedor (mixxx-info) para aplicar los cambios."}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if COVERS_DIR.exists():
    app.mount("/covers", StaticFiles(directory=str(COVERS_DIR)), name="covers")


# ── Camelot key conversion ────────────────────────────────────────────────────

_STANDARD_TO_CAMELOT: dict[str, str] = {
    "C": "8B",  "G": "9B",  "D": "10B", "A": "11B", "E": "12B", "B": "1B",
    "F#": "2B", "Gb": "2B", "Db": "3B", "C#": "3B", "Ab": "4B", "G#": "4B",
    "Eb": "5B", "D#": "5B", "Bb": "6B", "A#": "6B", "F": "7B",
    "Am": "8A", "Em": "9A",  "Bm": "10A", "F#m": "11A", "Dbm": "12A",
    "C#m": "12A", "Abm": "1A", "G#m": "1A",  "Ebm": "2A", "D#m": "2A",
    "Bbm": "3A", "A#m": "3A", "Fm": "4A",  "Cm": "5A",  "Gm": "6A",  "Dm": "7A",
}

_CAMELOT_TO_STANDARD: dict[str, str] = {v: k for k, v in _STANDARD_TO_CAMELOT.items()}

_CAMELOT_RE = re.compile(r"^(\d{1,2})([AB])$", re.IGNORECASE)


def to_camelot(key: str | None) -> str | None:
    if not key:
        return None
    key = key.strip()
    if _CAMELOT_RE.match(key):
        return key.upper()
    return _STANDARD_TO_CAMELOT.get(key) or _STANDARD_TO_CAMELOT.get(key.capitalize())


def compatible_camelot_keys(camelot: str) -> list[str]:
    """Return the 3-4 harmonically compatible Camelot keys."""
    m = _CAMELOT_RE.match(camelot)
    if not m:
        return [camelot]
    num, letter = int(m.group(1)), m.group(2).upper()
    candidates = [
        f"{num}{letter}",
        f"{(num % 12) + 1}{letter}",
        f"{(num - 2) % 12 + 1}{letter}",
        f"{num}{'B' if letter == 'A' else 'A'}",
    ]
    return [c for c in candidates if _CAMELOT_RE.match(c)]


def _camelot_distance(c1: str, c2: str) -> int:
    """Manhattan distance on Camelot wheel: |num_diff (circular)| + letter_diff."""
    m1, m2 = _CAMELOT_RE.match(c1.upper()), _CAMELOT_RE.match(c2.upper())
    if not m1 or not m2:
        return 999
    n1, l1 = int(m1.group(1)), m1.group(2)
    n2, l2 = int(m2.group(1)), m2.group(2)
    nd = abs(n1 - n2)
    return min(nd, 12 - nd) + (0 if l1 == l2 else 1)


def _camelot_keys_within(camelot: str, max_dist: int) -> list[str]:
    return [
        f"{n}{l}"
        for n in range(1, 13)
        for l in ("A", "B")
        if f"{n}{l}" != camelot and _camelot_distance(camelot, f"{n}{l}") <= max_dist
    ]


# Reverse mapping: camelot key → all standard notations (handles enharmonics)
from collections import defaultdict as _dd
_CAMELOT_TO_ALL_STANDARD: dict[str, list[str]] = _dd(list)
for _s, _c in _STANDARD_TO_CAMELOT.items():
    _CAMELOT_TO_ALL_STANDARD[_c].append(_s)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _song_dict(s: Song) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "artist": s.artist,
        "album": s.album,
        "label": s.label,
        "year": s.year,
        "folder_taste": s.folder_taste,
        "duration": s.duration,
        "bpm": s.bpm,
        "key_signature": s.key_signature,
        "camelot": to_camelot(s.key_signature),
        "custom_tags": s.custom_tags or [],
        "mb_tags": s.mb_tags or [],
        "artist_mb_tags": s.artist_mb_tags or [],
        "producers": s.producers or [],
        "engineers": s.engineers or [],
        "session_musicians": s.session_musicians or [],
        "samples": s.samples or [],
        "sampled_by": s.sampled_by or [],
        "lastfm_listeners": s.lastfm_listeners,
        "metacritic_score": s.metacritic_score,
        "metacritic_url": s.metacritic_url,
        "aoty_score": s.aoty_score,
        "aoty_url": s.aoty_url,
        "review_links": s.review_links or [],
        "cover_art_path": s.cover_art_path,
        "youtube_url": s.youtube_url,
        "artist_wikipedia_url": s.artist_wikipedia_url,
        "file_path": s.file_path,
    }


# ── Songs API ─────────────────────────────────────────────────────────────────

@app.get("/api/songs")
def list_songs(
    search: str = Query(""),
    taste: list[str] = Query([]),
    label: str = Query(""),
    tag: str = Query(""),
    bpm_min: float = Query(0),
    bpm_max: float = Query(999),
    year_min: int = Query(0),
    year_max: int = Query(9999),
    camelot: str = Query(""),
    compatible: bool = Query(False),
    sort: str = Query("artist"),
    sort_dir: str = Query("asc"),
    page: int = Query(1),
    per_page: int = Query(500),
):
    with Session(engine) as session:
        q = session.query(Song)

        if search:
            pat = f"%{search}%"
            q = q.filter(or_(
                Song.artist.ilike(pat),
                Song.title.ilike(pat),
                Song.album.ilike(pat),
                Song.label.ilike(pat),
                Song.custom_tags.cast(String).ilike(pat),
            ))

        if taste:
            q = q.filter(Song.folder_taste.in_(taste))

        if label:
            q = q.filter(Song.label.ilike(f"%{label}%"))

        if tag:
            q = q.filter(Song.custom_tags.cast(String).ilike(f"%{tag}%"))

        if bpm_min or bpm_max < 999:
            q = q.filter(Song.bpm.isnot(None))
            if bpm_min:
                q = q.filter(Song.bpm >= bpm_min)
            if bpm_max < 999:
                q = q.filter(Song.bpm <= bpm_max)

        if year_min:
            q = q.filter(func.substr(Song.year, 1, 4) >= str(year_min))
        if year_max < 9999:
            q = q.filter(func.substr(Song.year, 1, 4) <= str(year_max))

        if camelot:
            keys_to_match = compatible_camelot_keys(camelot) if compatible else [camelot]
            standard_keys = []
            for ck in keys_to_match:
                std = _CAMELOT_TO_STANDARD.get(ck.upper())
                if std:
                    standard_keys.append(std)
                standard_keys.append(ck)
            q = q.filter(Song.key_signature.in_(standard_keys))

        # Sorting
        sort_col = {
            "artist": Song.artist,
            "title": Song.title,
            "album": Song.album,
            "bpm": Song.bpm,
            "key_signature": Song.key_signature,
            "duration": Song.duration,
            "year": Song.year,
            "lastfm": Song.lastfm_listeners,
        }.get(sort, Song.artist)
        q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

        total = q.count()
        songs = q.offset((page - 1) * per_page).limit(per_page).all()

        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "songs": [_song_dict(s) for s in songs],
        }


def _song_full_dict(s: Song) -> dict:
    d = _song_dict(s)
    d.update({
        "sample_rate": s.sample_rate,
        "bit_depth": s.bit_depth,
        "channels": s.channels,
        "isrc": s.isrc,
        "release_type": s.release_type,
        "release_status": s.release_status,
        "release_country": s.release_country,
        "catalog_number": s.catalog_number,
        "musicbrainz_id": s.musicbrainz_id,
        "musicbrainz_release_id": s.musicbrainz_release_id,
        "discogs_release_id": s.discogs_release_id,
        "artist_wikipedia_content": s.artist_wikipedia_content,
        "album_wikipedia_url": s.album_wikipedia_url,
        "cover_art_url": s.cover_art_url,
        "metacritic_num_critics": s.metacritic_num_critics,
        "metacritic_positive": s.metacritic_positive,
        "metacritic_mixed": s.metacritic_mixed,
        "metacritic_negative": s.metacritic_negative,
        "aoty_critic_score": s.aoty_critic_score,
        "aoty_user_score": s.aoty_user_score,
        "aoty_num_critic_ratings": s.aoty_num_critic_ratings,
        "aoty_num_user_ratings": s.aoty_num_user_ratings,
        "bandcamp_url": s.bandcamp_url,
        "artist_profile": s.artist_profile,
        "artist_real_name": s.artist_real_name,
        "artist_aliases": s.artist_aliases or [],
        "gemini_context": s.gemini_context,
        "gemini_sources": s.gemini_sources or [],
    })
    return d


@app.get("/api/songs/{song_id}")
def get_song(song_id: int):
    with Session(engine) as session:
        s = session.get(Song, song_id)
        if not s:
            raise HTTPException(404, "Song not found")
        return _song_full_dict(s)


@app.get("/api/suggestions")
def get_suggestions(
    song_id: int,
    mode: str = Query("bpm"),   # "bpm" | "key"
    delta: float = Query(5),
    taste: list[str] = Query([]),
):
    """Return candidate songs compatible with song_id based on BPM or Camelot key proximity."""
    with Session(engine) as session:
        song = session.get(Song, song_id)
        if not song:
            raise HTTPException(404, "Song not found")

        q = session.query(Song).filter(Song.id != song_id)

        if taste:
            q = q.filter(Song.folder_taste.in_(taste))

        if mode == "bpm":
            if not song.bpm:
                return []
            q = q.filter(
                Song.bpm.isnot(None),
                Song.bpm >= song.bpm - delta,
                Song.bpm <= song.bpm + delta,
            )
        elif mode == "key":
            camelot = to_camelot(song.key_signature)
            if not camelot:
                return []
            compat_camelot = _camelot_keys_within(camelot, int(delta))
            # Include both Camelot notation and standard notation variants
            all_keys: set[str] = set(compat_camelot)
            for ck in compat_camelot:
                all_keys.update(_CAMELOT_TO_ALL_STANDARD.get(ck, []))
            q = q.filter(Song.key_signature.in_(list(all_keys)))

        songs = q.order_by(Song.bpm).limit(80).all()
        return [_song_dict(s) for s in songs]


@app.get("/api/stream/{song_id}")
def stream_song(song_id: int):
    with Session(engine) as session:
        s = session.get(Song, song_id)
        if not s:
            raise HTTPException(404, "Song not found")
    path = Path(s.file_path)
    if not path.exists():
        raise HTTPException(404, "File not found on disk")
    mime, _ = mimetypes.guess_type(str(path))
    return FileResponse(str(path), media_type=mime or "audio/mpeg")


# ── Filter metadata ───────────────────────────────────────────────────────────

@app.get("/api/filters/meta")
def filter_meta():
    with Session(engine) as session:
        tastes = [
            r[0] for r in session.query(Song.folder_taste).distinct().order_by(Song.folder_taste)
            if r[0]
        ]
        labels = [
            r[0] for r in session.query(Song.label).distinct().order_by(Song.label)
            if r[0]
        ]
        bpm_row = session.query(func.min(Song.bpm), func.max(Song.bpm)).filter(
            Song.bpm.isnot(None)
        ).first()
        year_row = session.query(
            func.min(func.substr(Song.year, 1, 4)),
            func.max(func.substr(Song.year, 1, 4)),
        ).filter(Song.year.isnot(None)).first()

        return {
            "tastes": tastes,
            "labels": labels[:200],
            "bpm_range": [bpm_row[0] or 60, bpm_row[1] or 200] if bpm_row else [60, 200],
            "year_range": [int(year_row[0] or 1950), int(year_row[1] or 2025)] if year_row else [1950, 2025],
        }


# ── Playlists API ─────────────────────────────────────────────────────────────

class PlaylistCreate(BaseModel):
    name: str


class PlaylistRename(BaseModel):
    name: str


class TrackAdd(BaseModel):
    song_id: int


class ReorderBody(BaseModel):
    song_ids: list[int]


def _playlist_dict(pl: Playlist) -> dict:
    return {
        "id": pl.id,
        "name": pl.name,
        "created_at": pl.created_at,
        "track_count": len(pl.tracks),
        "tracks": [
            {**_song_dict(pt.song), "position": pt.position}
            for pt in pl.tracks
        ],
    }


@app.get("/api/playlists")
def list_playlists():
    with Session(engine) as session:
        pls = session.query(Playlist).order_by(Playlist.id).all()
        return [{"id": p.id, "name": p.name, "track_count": len(p.tracks), "created_at": p.created_at} for p in pls]


@app.post("/api/playlists", status_code=201)
def create_playlist(body: PlaylistCreate):
    with Session(engine) as session:
        pl = Playlist(name=body.name, created_at=datetime.utcnow().isoformat())
        session.add(pl)
        session.commit()
        session.refresh(pl)
        return {"id": pl.id, "name": pl.name, "created_at": pl.created_at, "track_count": 0, "tracks": []}


@app.get("/api/playlists/{playlist_id}")
def get_playlist(playlist_id: int):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        return _playlist_dict(pl)


@app.patch("/api/playlists/{playlist_id}")
def rename_playlist(playlist_id: int, body: PlaylistRename):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        pl.name = body.name
        session.commit()
        return {"id": pl.id, "name": pl.name}


@app.delete("/api/playlists/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: int):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        session.delete(pl)
        session.commit()


@app.post("/api/playlists/{playlist_id}/tracks", status_code=201)
def add_track(playlist_id: int, body: TrackAdd):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        song = session.get(Song, body.song_id)
        if not song:
            raise HTTPException(404, "Song not found")
        max_pos = max((pt.position for pt in pl.tracks), default=-1)
        pt = PlaylistTrack(playlist_id=playlist_id, song_id=body.song_id, position=max_pos + 1)
        session.add(pt)
        session.commit()
        return {"ok": True}


@app.delete("/api/playlists/{playlist_id}/tracks/{song_id}", status_code=204)
def remove_track(playlist_id: int, song_id: int):
    with Session(engine) as session:
        pt = session.query(PlaylistTrack).filter_by(
            playlist_id=playlist_id, song_id=song_id
        ).first()
        if pt:
            session.delete(pt)
            session.commit()


@app.put("/api/playlists/{playlist_id}/tracks/reorder")
def reorder_tracks(playlist_id: int, body: ReorderBody):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        pos_map = {sid: i for i, sid in enumerate(body.song_ids)}
        for pt in pl.tracks:
            if pt.song_id in pos_map:
                pt.position = pos_map[pt.song_id]
        session.commit()
        return {"ok": True}


@app.get("/api/playlists/{playlist_id}/export.m3u")
def export_m3u(playlist_id: int):
    with Session(engine) as session:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Playlist not found")
        lines = ["#EXTM3U"]
        for pt in pl.tracks:
            s = pt.song
            dur = int(s.duration or -1)
            display = f"{s.artist or ''} - {s.title or ''}"
            lines.append(f"#EXTINF:{dur},{display}")
            lines.append(s.file_path)
        return PlainTextResponse("\n".join(lines), media_type="audio/x-mpegurl")


# ── Statistics ────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(taste: list[str] = Query([]), label: str = Query("")):
    with Session(engine) as session:
        q = session.query(Song)
        if taste:
            q = q.filter(Song.folder_taste.in_(taste))
        if label:
            q = q.filter(Song.label == label)
        songs = q.all()

    total = len(songs)
    if total == 0:
        return {"total": 0}

    def pct(n): return round(n / total * 100, 1)

    # ── Coverage: % of songs with each field filled ──
    coverage_fields = [
        ("title", "Título"), ("artist", "Artista"), ("album", "Álbum"),
        ("year", "Año"), ("label", "Sello"), ("bpm", "BPM"),
        ("key_signature", "Key"), ("duration", "Duración"),
        ("sample_rate", "Sample rate"), ("bit_depth", "Bit depth"),
        ("custom_tags", "Tags custom"), ("cover_art_path", "Cover art"),
        ("musicbrainz_id", "MusicBrainz ID"), ("discogs_release_id", "Discogs ID"),
        ("isrc", "ISRC"), ("acoustid_fingerprint", "AcoustID"),
        ("producers", "Productores"), ("engineers", "Ingenieros"),
        ("session_musicians", "Músicos sesión"),
        ("samples", "Samples usados"), ("sampled_by", "Sampleado por"),
        ("lastfm_listeners", "Last.fm oyentes"),
        ("metacritic_score", "Metacritic score"), ("aoty_score", "AOTY score"),
        ("review_links", "Review links"),
        ("artist_wikipedia_url", "Wikipedia artista"),
        ("album_wikipedia_url", "Wikipedia álbum"),
        ("artist_wikipedia_content", "Wikipedia texto"),
        ("youtube_url", "YouTube"), ("bandcamp_url", "Bandcamp"),
        ("artist_profile", "Perfil Discogs"), ("artist_real_name", "Nombre real"),
        ("artist_aliases", "Aliases"), ("gemini_context", "AI Gemini"),
        ("release_type", "Tipo release"), ("release_status", "Estado release"),
        ("release_country", "País"), ("catalog_number", "Cat. number"),
        ("mb_tags", "MB tags"), ("artist_mb_tags", "MB artist tags"),
    ]
    coverage = [
        {"field": label, "count": sum(1 for s in songs if getattr(s, fld) is not None), "pct": pct(sum(1 for s in songs if getattr(s, fld) is not None))}
        for fld, label in coverage_fields
    ]

    # ── BPM histogram (buckets of 5) ──
    bpm_values = [s.bpm for s in songs if s.bpm]
    bpm_counter = Counter(int(b // 5) * 5 for b in bpm_values)
    bpm_distribution = [{"bpm": k, "count": v} for k, v in sorted(bpm_counter.items())]

    # ── Camelot key distribution ──
    camelot_order = [f"{n}{l}" for n in range(1, 13) for l in ("A", "B")]
    key_counter = Counter()
    for s in songs:
        ck = to_camelot(s.key_signature)
        if ck:
            key_counter[ck] += 1
    key_distribution = [{"key": k, "count": key_counter.get(k, 0)} for k in camelot_order]

    # ── Genre ──
    genre_counter = Counter(s.folder_taste for s in songs if s.folder_taste)
    genre_distribution = [{"taste": k, "count": v} for k, v in genre_counter.most_common()]

    # ── Top labels ──
    label_counter = Counter(s.label for s in songs if s.label)
    label_distribution = [{"label": k, "count": v} for k, v in label_counter.most_common(30)]

    # ── Year ──
    year_counter = Counter(str(s.year)[:4] for s in songs if s.year and len(str(s.year)) >= 4)
    year_distribution = [{"year": k, "count": v} for k, v in sorted(year_counter.items())]

    # ── Duration (minute buckets) ──
    dur_counter = Counter(int(s.duration // 60) for s in songs if s.duration)
    duration_distribution = [{"min": k, "count": v} for k, v in sorted(dur_counter.items())]

    # ── Custom tags ──
    tag_counter = Counter()
    for s in songs:
        for t in (s.custom_tags or []):
            tag_counter[t] += 1
    top_tags = [{"tag": k, "count": v} for k, v in tag_counter.most_common(40)]

    # ── Top producers ──
    prod_counter = Counter()
    for s in songs:
        for p in (s.producers or []):
            prod_counter[p] += 1
    top_producers = [{"name": k, "count": v} for k, v in prod_counter.most_common(25)]

    # ── Top artists ──
    artist_counter = Counter(s.artist for s in songs if s.artist)
    top_artists = [{"artist": k, "count": v} for k, v in artist_counter.most_common(25)]

    # ── Audio quality ──
    sr_counter = Counter(s.sample_rate for s in songs if s.sample_rate)
    bd_counter = Counter(s.bit_depth for s in songs if s.bit_depth)
    ch_counter = Counter(s.channels for s in songs if s.channels)

    # ── Release metadata ──
    type_counter = Counter(s.release_type for s in songs if s.release_type)
    status_counter = Counter(s.release_status for s in songs if s.release_status)
    country_counter = Counter(s.release_country for s in songs if s.release_country)

    # ── Critic scores ──
    mc_counter = Counter(int(s.metacritic_score // 10) * 10 for s in songs if s.metacritic_score)
    aoty_counter = Counter(int((s.aoty_score or 0) // 10) * 10 for s in songs if s.aoty_score)

    # ── Last.fm listeners ──
    def lf_bucket(n):
        if n < 10_000: return "<10k"
        if n < 100_000: return "10k-100k"
        if n < 500_000: return "100k-500k"
        if n < 1_000_000: return "500k-1M"
        if n < 5_000_000: return "1M-5M"
        return ">5M"
    lf_counter = Counter(lf_bucket(s.lastfm_listeners) for s in songs if s.lastfm_listeners)
    lf_order = ["<10k", "10k-100k", "100k-500k", "500k-1M", "1M-5M", ">5M"]
    lastfm_distribution = [{"bucket": b, "count": lf_counter.get(b, 0)} for b in lf_order if b in lf_counter]

    # ── MB artist tags ──
    mbtag_counter = Counter()
    for s in songs:
        for t in (s.artist_mb_tags or [])[:5]:
            mbtag_counter[t] += 1
    top_mb_tags = [{"tag": k, "count": v} for k, v in mbtag_counter.most_common(30)]

    return {
        "total": total,
        "coverage": coverage,
        "bpm_distribution": bpm_distribution,
        "key_distribution": key_distribution,
        "genre_distribution": genre_distribution,
        "label_distribution": label_distribution,
        "year_distribution": year_distribution,
        "duration_distribution": duration_distribution,
        "top_tags": top_tags,
        "top_producers": top_producers,
        "top_artists": top_artists,
        "sample_rate_distribution": [{"rate": k, "count": v} for k, v in sr_counter.most_common()],
        "bit_depth_distribution": [{"depth": k, "count": v} for k, v in bd_counter.most_common()],
        "channels_distribution": [{"ch": k, "count": v} for k, v in ch_counter.most_common()],
        "release_type_distribution": [{"type": k, "count": v} for k, v in type_counter.most_common()],
        "release_status_distribution": [{"status": k, "count": v} for k, v in status_counter.most_common()],
        "release_country_distribution": [{"country": k, "count": v} for k, v in country_counter.most_common(20)],
        "metacritic_distribution": [{"score": k, "count": v} for k, v in sorted(mc_counter.items())],
        "aoty_distribution": [{"score": k, "count": v} for k, v in sorted(aoty_counter.items())],
        "lastfm_distribution": lastfm_distribution,
        "top_mb_tags": top_mb_tags,
    }


# ── Musician / credits graph ───────────────────────────────────────────────────

_DISCOGS_HEADERS = {
    "User-Agent": "mixxx_info/1.0 +https://github.com/local/mixxx_info",
}


def _discogs_headers() -> dict:
    token = os.getenv("DISCOGS_TOKEN")
    h = dict(_DISCOGS_HEADERS)
    if token:
        h["Authorization"] = f"Discogs token={token}"
    return h


@app.get("/api/musician")
def get_musician(name: str = Query(...)):
    """Return all library songs where `name` appears (any role) + Discogs discography + graph data."""
    with Session(engine) as session:
        pat = f"%{name}%"
        as_artist   = session.query(Song).filter(Song.artist.ilike(pat)).order_by(Song.year.desc()).all()
        as_producer = session.query(Song).filter(Song.producers.cast(String).ilike(pat)).order_by(Song.year.desc()).all()
        as_engineer = session.query(Song).filter(Song.engineers.cast(String).ilike(pat)).order_by(Song.year.desc()).all()
        as_musician = session.query(Song).filter(Song.session_musicians.cast(String).ilike(pat)).order_by(Song.year.desc()).all()

    all_songs = as_artist + as_producer + as_engineer + as_musician
    library_titles = {s.title.lower().strip() for s in all_songs if s.title}

    # ── Co-credit graph from library ──────────────────────────────────────────
    name_lower = name.lower()
    co_artists   = Counter()
    co_producers = Counter()
    co_engineers = Counter()
    co_labels    = Counter()

    for s in all_songs:
        if s.artist and s.artist.lower() != name_lower:
            co_artists[s.artist] += 1
        if s.label:
            co_labels[s.label] += 1
        for p in (s.producers or []):
            if p.lower() != name_lower:
                co_producers[p] += 1
        for e in (s.engineers or []):
            if e.lower() != name_lower:
                co_engineers[e] += 1

    collaborators = {
        "artists":   [{"name": k, "count": v} for k, v in co_artists.most_common(12)],
        "producers": [{"name": k, "count": v} for k, v in co_producers.most_common(8)],
        "engineers": [{"name": k, "count": v} for k, v in co_engineers.most_common(8)],
        "labels":    [{"name": k, "count": v} for k, v in co_labels.most_common(8)],
    }

    # ── Discogs ───────────────────────────────────────────────────────────────
    discogs_artist = None
    discogs_releases: list[dict] = []
    discogs_collab_artists: list[dict] = []
    discogs_collab_labels: list[dict] = []
    discogs_error: str | None = None

    try:
        h = _discogs_headers()

        # Search — try with type=artist first, then broader fallback
        search_r = _req.get(
            "https://api.discogs.com/database/search",
            params={"q": name, "type": "artist", "per_page": 5},
            headers=h, timeout=10,
        )
        results = search_r.json().get("results", []) if search_r.status_code == 200 else []

        if not results:
            search_r2 = _req.get(
                "https://api.discogs.com/database/search",
                params={"q": name, "per_page": 10},
                headers=h, timeout=10,
            )
            if search_r2.status_code == 200:
                results = [r for r in search_r2.json().get("results", []) if r.get("type") == "artist"]

        if results:
            discogs_artist = results[0]
            artist_id = results[0]["id"]
            rel_r = _req.get(
                f"https://api.discogs.com/artists/{artist_id}/releases",
                params={"sort": "year", "sort_order": "desc", "per_page": 100},
                headers=h, timeout=10,
            )
            if rel_r.status_code == 200:
                raw = rel_r.json().get("releases", [])
                for r in raw:
                    r["in_library"] = (r.get("title") or "").lower().strip() in library_titles
                discogs_releases = raw

                # Collaboration artists & labels from Discogs (not already in library graph)
                lib_artist_lower = {x["name"].lower() for x in collaborators["artists"]}
                disc_a = Counter()
                disc_l = Counter()
                for r in raw:
                    a = r.get("artist", "")
                    if a and r.get("role", "Main") != "Main":
                        disc_a[a] += 1
                    if r.get("label"):
                        disc_l[r["label"]] += 1
                discogs_collab_artists = [
                    {"name": k, "count": v}
                    for k, v in disc_a.most_common(10)
                    if k.lower() not in lib_artist_lower
                ]
                discogs_collab_labels = [{"name": k, "count": v} for k, v in disc_l.most_common(6)]
        else:
            discogs_error = "No encontrado en Discogs"
    except Exception as exc:
        discogs_error = str(exc)

    return {
        "name": name,
        "library": {
            "as_artist":   [_song_dict(s) for s in as_artist],
            "as_producer": [_song_dict(s) for s in as_producer],
            "as_engineer": [_song_dict(s) for s in as_engineer],
            "as_musician": [_song_dict(s) for s in as_musician],
        },
        "collaborators":         collaborators,
        "discogs_artist":        discogs_artist,
        "discogs_releases":      discogs_releases,
        "discogs_collab_artists": discogs_collab_artists,
        "discogs_collab_labels": discogs_collab_labels,
        "discogs_error":         discogs_error,
    }
