"""
Finds streaming/platform links for a track.
YouTube: scrapes search results page (no API key required).
Bandcamp: scrapes search results.
"""
import time

import requests
from bs4 import BeautifulSoup

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; mixxx_info/0.1)"}


def _youtube(artist: str, title: str) -> str | None:
    query = f"{artist} {title} official".replace(" ", "+")
    try:
        resp = requests.get(
            f"https://www.youtube.com/results?search_query={query}",
            headers=_HEADERS,
            timeout=12,
        )
        soup = BeautifulSoup(resp.text, "html.parser")
        # Video IDs appear in renderer JSON embedded in the page
        import re
        ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', resp.text)
        return f"https://www.youtube.com/watch?v={ids[0]}" if ids else None
    except Exception:
        return None


def _bandcamp(artist: str, title: str) -> str | None:
    query = f"{artist} {title}".replace(" ", "+")
    try:
        resp = requests.get(
            f"https://bandcamp.com/search?q={query}&item_type=t",
            headers=_HEADERS,
            timeout=12,
        )
        soup = BeautifulSoup(resp.text, "html.parser")
        link = soup.select_one(".result-info .heading a")
        return link["href"].split("?")[0] if link else None
    except Exception:
        return None


def enrich_links(artist: str, title: str) -> dict:
    result: dict = {}
    yt = _youtube(artist, title)
    if yt:
        result["youtube_url"] = yt
    time.sleep(1.5)
    bc = _bandcamp(artist, title)
    if bc:
        result["bandcamp_url"] = bc
    return result
