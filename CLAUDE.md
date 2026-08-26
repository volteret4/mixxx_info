# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal music archive and metadata enrichment system. The goal is to scan a local music library at `/mnt/windows/Mix` (organized by folders/taste), enrich tracks with deep metadata from external APIs and AI, and expose everything via a web dashboard — essentially a personal Discogs-style encyclopedia useful for DJ sessions.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Phase A — scan library, write library.json
python main.py scan [--root /mnt/windows/Mix] [--output library.json]

# Phase B — enrich from APIs into library.db
python main.py enrich [--input library.json] [--limit 50]

# Phase C — fill gaps with Gemini AI
python main.py ai-enrich [--limit 50]

# Quick DB query
python main.py query --artist "Daft Punk" --taste "Electronic"
```

## Stack

- **Backend**: Python (FastAPI preferred)
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **AI enrichment**: Gemini 1.5 Pro/Flash API
- **Frontend**: React or Next.js
- **Audio fingerprinting**: AcoustID / Chromaprint

## Secrets

All secrets live in `.encrypted.env` (never `.env`). Load them using `sopsdotenv`:

```python
from sopsdotenv import load_sopsenv
load_sopsenv()
```

Required keys: `GEMINI_API_KEY`, `DISCOGS_TOKEN`, `LASTFM_API_KEY`.

## Pre-commit Hook

Gitleaks runs on every staged commit to catch hardcoded secrets. Install hooks before first commit:

```bash
pre-commit install
```

## Data Pipeline (three phases)

**Phase A — Local scan**: Walk `/mnt/windows/Mix`, extract ID3 tags (title, artist, album), fingerprint untagged files with AcoustID/Chromaprint. Output: `library.json`.

**Phase B — API enrichment** (cascade):
1. MusicBrainz/Discogs → label, producers, engineers, release dates
2. Spotify/Last.fm → popularity, listener count, genres
3. WhoSampled (scrape) → sample genealogy (samples used / sampled by)

**Phase C — Gemini enrichment**: For data not cleanly returned by APIs. Always request a `sources` field (URLs/DB names) in the JSON response to keep AI output verifiable. Validate AI-returned data against a second source when possible.

## Song Entity Schema

Each track record must include:
- **Core**: title, artist, album, label, year
- **Credits**: producers, mix/mastering engineers, session musicians
- **Genealogy**: `samples` (list), `sampled_by` (list)
- **Metrics**: Last.fm listeners, Spotify popularity
- **Local metadata**: file path, original folder/taste tag

## AI Guidance

When writing enrichment scripts, always make the Gemini prompt request a strict JSON response with a `sources` array. Design UI minimalistically — fast-read, Discogs-inspired layout.

## Playlists → Mixxx (Syncthing)

`api/main.py`'s playlist endpoints (`POST/PATCH/DELETE /api/playlists*`) write
an `.m3u` file to `PLAYLISTS_DIR` (`playlists/`, bind-mounted in
`docker-compose.yml`) on every mutation — create, rename (deletes the old
filename, writes the new one), add/remove/reorder tracks, delete. No manual
"export" step needed; the UI (`PlaylistPanel.jsx`) already calls these same
endpoints for its normal CRUD actions.

That `playlists/` directory is one side of a **dedicated Syncthing folder**
("Mixxx Playlists", id `mixxx-playlists`, `sendreceive` on both ends) —
deliberately separate from the existing "Mixxx" folder (`sendonly` on the
laptop / `receiveonly` on pepecono) that mirrors the actual audio
collection. That asymmetry is intentional: it protects the real collection
from ever being touched by something running on the server. The playlists
folder carries none of that risk (just small `.m3u` text files), so it's
safe to be fully bidirectional.

On the laptop side, the synced path is `/mnt/windows/Mix_Playlists` — for
Mixxx to actually pick these up, that path needs to be added as a music
directory in Mixxx's own Preferences → Library (one-time manual step; Mixxx
auto-detects and imports/updates `.m3u`/`.pls` files inside directories it
already has added, on library rescan/startup — it does not watch arbitrary
folders on its own).

`Song.file_path` is captured at scan time from `/mnt/windows/Mix` (the
laptop's real path, see Phase A above), so the paths written into each
`.m3u` are already correct, native local paths for Mixxx — no rewriting
needed between the container's view and the laptop's.
