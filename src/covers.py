import hashlib
from pathlib import Path

import requests

_HEADERS = {"User-Agent": "mixxx_info/0.1 +viciosmusicales@gmail.com"}


def _caa_url(mb_release_id: str) -> str | None:
    """Cover Art Archive — returns the front-cover image URL for a MusicBrainz release."""
    try:
        resp = requests.get(
            f"https://coverartarchive.org/release/{mb_release_id}",
            headers=_HEADERS,
            timeout=10,
            allow_redirects=True,
        )
        if resp.status_code != 200:
            return None
        images = resp.json().get("images", [])
        front = next((img for img in images if img.get("front")), None)
        return (front or images[0])["image"] if (front or images) else None
    except Exception:
        return None


def _discogs_url(release_id: str, token: str) -> str | None:
    try:
        resp = requests.get(
            f"https://api.discogs.com/releases/{release_id}",
            params={"token": token},
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        images = resp.json().get("images", [])
        primary = next((img for img in images if img.get("type") == "primary"), None)
        return (primary or images[0])["uri"] if (primary or images) else None
    except Exception:
        return None


def thumb_url(url: str, size: int = 500) -> str:
    """Miniatura de Cover Art Archive (250, 500 o 1200 px) en vez de la imagen original."""
    if "coverartarchive.org/release/" in url:
        base, _, ext = url.rpartition(".")
        if base and "/" not in ext and not base.endswith(("-250", "-500", "-1200")):
            url = f"{base}-{size}.{ext}"
        url = url.replace("http://", "https://", 1)
    return url


def _download(url: str, dest: Path) -> bool:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=20, stream=True)
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return True
    except Exception:
        return False


def fetch_cover(
    artist: str,
    album: str,
    covers_dir: Path,
    mb_release_id: str | None = None,
    discogs_release_id: str | None = None,
    discogs_token: str | None = None,
    download: bool = False,
) -> tuple[str | None, str | None]:
    """
    Returns (local_relative_path, source_url).
    Tries Cover Art Archive first, then Discogs.
    By default nothing is downloaded: the path is only the key that
    /covers/<name> resolves, redirecting to source_url when there is no
    local file. With download=True the image is saved as before.
    """
    source_url = None
    if mb_release_id:
        source_url = _caa_url(mb_release_id)
    if not source_url and discogs_release_id and discogs_token:
        source_url = _discogs_url(discogs_release_id, discogs_token)
    if not source_url:
        return None, None

    slug = hashlib.md5(f"{artist}:{album}".encode()).hexdigest()[:12]
    ext = source_url.split("?")[0].rsplit(".", 1)[-1].lower()
    ext = ext if ext in ("jpg", "jpeg", "png", "webp") else "jpg"
    dest = covers_dir / f"{slug}.{ext}"

    if dest.exists() or not download:
        return str(dest), source_url

    return (str(dest), source_url) if _download(source_url, dest) else (None, source_url)
