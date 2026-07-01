from pathlib import Path

from mutagen import File as MutagenFile

MUSIC_ROOT = Path("/mnt/windows/Mix")
SUPPORTED = {".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aiff", ".opus"}

# Vorbis Comment / ID3 easy-key variants used by Mixxx, Rekordbox, beets, etc.
_BPM_KEYS = ("bpm", "tempo")
_KEY_KEYS = ("key", "initialkey", "tkey")


def _first(audio, *keys) -> str | None:
    for k in keys:
        val = audio.get(k)
        if val:
            return val[0]
    return None


def _read_comment(path: Path) -> str | None:
    """
    Read the comment/description field regardless of format.
    FLAC uses Vorbis Comment 'comment'; MP3 uses ID3 COMM frames which
    easy=True does not expose.
    """
    try:
        audio = MutagenFile(path)
        if audio is None or audio.tags is None:
            return None
        # Vorbis Comments (FLAC, OGG, Opus)
        for key in ("comment", "COMMENT", "description", "DESCRIPTION"):
            val = audio.tags.get(key)
            if val:
                return val[0] if isinstance(val, list) else str(val)
        # ID3 COMM frames (MP3, AIFF)
        if hasattr(audio.tags, "getall"):
            for frame in audio.tags.getall("COMM"):
                if frame.text:
                    return str(frame.text[0])
    except Exception:
        pass
    return None


def extract_tags(path: Path) -> dict:
    try:
        audio = MutagenFile(path, easy=True)
    except Exception:
        return {}
    if audio is None:
        return {}

    tags: dict = {
        "title": _first(audio, "title"),
        "artist": _first(audio, "artist"),
        "album": _first(audio, "album"),
        "year": _first(audio, "date"),
    }

    raw_bpm = _first(audio, *_BPM_KEYS)
    if raw_bpm:
        try:
            tags["bpm"] = float(raw_bpm)
        except ValueError:
            pass

    raw_key = _first(audio, *_KEY_KEYS)
    if raw_key:
        tags["key_signature"] = raw_key

    # Audio stream info (sample_rate, bit_depth, channels, duration)
    info = getattr(audio, "info", None)
    if info:
        tags["duration"] = round(getattr(info, "length", None) or 0, 2) or None
        tags["sample_rate"] = getattr(info, "sample_rate", None)
        tags["bit_depth"] = getattr(info, "bits_per_sample", None)  # FLAC/WAV only
        tags["channels"] = getattr(info, "channels", None)

    # Custom tags from the comment field (space-separated, DJ workflow)
    raw_comment = _read_comment(path)
    if raw_comment:
        parsed = [t.strip() for t in raw_comment.split() if t.strip()]
        if parsed:
            tags["custom_tags"] = parsed

    return {k: v for k, v in tags.items() if v is not None}


def get_folder_taste(path: Path, root: Path) -> str:
    """Top-level subfolder under root encodes the user's taste/mood label."""
    try:
        parts = path.relative_to(root).parts
        return parts[0] if len(parts) > 1 else "root"
    except ValueError:
        return "unknown"


def fingerprint(path: Path) -> str | None:
    """Returns raw Chromaprint fingerprint. Requires fpcalc in PATH."""
    try:
        import acoustid
        _, fp = acoustid.fingerprint_file(str(path))
        return fp.decode() if isinstance(fp, bytes) else fp
    except Exception:
        return None


def scan_library(root: Path = MUSIC_ROOT, fingerprint_all: bool = False) -> tuple[list[dict], list[str]]:
    """Returns (tracks, skipped_paths). Skipped files are unreadable by mutagen.

    fingerprint_all: compute AcoustID fingerprint for every file, not just untagged ones.
    """
    tracks, skipped = [], []
    for file in sorted(root.rglob("*")):
        if file.suffix.lower() not in SUPPORTED:
            continue
        tags = extract_tags(file)
        if tags is None:
            skipped.append(str(file))
            continue
        entry = {
            "file_path": str(file),
            "folder_taste": get_folder_taste(file, root),
            **tags,
        }
        needs_fp = fingerprint_all or not tags.get("title") or not tags.get("artist")
        if needs_fp:
            fp = fingerprint(file)
            if fp:
                entry["acoustid_fingerprint"] = fp
        tracks.append(entry)
    return tracks, skipped
