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
