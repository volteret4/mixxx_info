"""
Album review scores from Metacritic and Album of the Year (AOTY).
Uses nodriver (undetected Chrome) via a persistent background thread —
one browser instance shared across the entire enrich session.

Call start_browser() once before processing, stop_browser() when done.
enrich_reviews() is safe to call without start_browser() (lazy init).
"""
import asyncio
import os
import re
import random
import threading
import urllib.parse

import nodriver as uc
import requests
from bs4 import BeautifulSoup

_SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://localhost:8485")

# ── Persistent async loop (shared browser across all songs) ──────────────────

_loop: asyncio.AbstractEventLoop | None = None
_loop_thread: threading.Thread | None = None
_browser = None
_browser_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop, _loop_thread
    if _loop is None or not _loop.is_running():
        _loop = asyncio.new_event_loop()
        _loop_thread = threading.Thread(target=_loop.run_forever, daemon=True)
        _loop_thread.start()
    return _loop


def _run(coro):
    """Submit a coroutine to the background loop and block until done."""
    return asyncio.run_coroutine_threadsafe(coro, _ensure_loop()).result()


async def _get_browser():
    global _browser
    with _browser_lock:
        if _browser is None:
            _browser = await uc.start(headless=True)
    return _browser


def start_browser():
    """Pre-warm the browser. Call once at the start of an enrich session."""
    _run(_get_browser())


def stop_browser():
    """Shut down the shared browser. Call once at the end of an enrich session."""
    global _browser
    if _browser is not None:
        try:
            _browser.stop()
        except Exception:
            pass
        _browser = None


# ── Slug / name variations ────────────────────────────────────────────────────

def _slug(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    return re.sub(r"-+", "-", name).strip("-")


def _name_variations(name: str) -> list[str]:
    variants = [name]
    lower = name.lower()
    if lower.startswith("the "):
        variants.append(name[4:])
    if lower.startswith("a "):
        variants.append(name[2:])
    variants.append(re.sub(r"[^\w\s]", "", name))
    return list(dict.fromkeys(variants))


# ── AnyDecentMusic (plain requests — no bot detection) ────────────────────────

_ADM_BASE = "http://www.anydecentmusic.com"
_ADM_HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}


def _adm_search(artist: str, album: str) -> list[dict]:
    """Return list of {source, url} review links via AnyDecentMusic."""
    try:
        url = f"{_ADM_BASE}/search-results.aspx?search={urllib.parse.quote(artist)}"
        soup = BeautifulSoup(requests.get(url, headers=_ADM_HEADERS, timeout=12).text, "html.parser")
        album_lower = album.lower()
        for result in soup.select("form > div > div > div > ul > li > div"):
            artist_el = result.select_one("a:nth-of-type(2) > h2")
            album_el = result.select_one("a:nth-of-type(3) > h3")
            link_el = result.select_one("a:nth-of-type(3)")
            if not (artist_el and album_el and link_el):
                continue
            if artist.lower() not in artist_el.get_text().lower():
                continue
            if album_lower not in album_el.get_text().lower():
                continue
            href = link_el.get("href", "")
            album_url = href if href.startswith("http") else f"{_ADM_BASE}/{href.lstrip('/')}"
            return _adm_extract_links(album_url)
    except Exception:
        pass
    return []


def _adm_extract_links(album_url: str) -> list[dict]:
    try:
        soup = BeautifulSoup(requests.get(album_url, headers=_ADM_HEADERS, timeout=12).text, "html.parser")
        links = []
        for li in soup.select("form > div > div > div > ol > li"):
            a = li.select_one("p > a")
            if not a or "Read Review" not in a.get_text():
                continue
            href = a.get("href", "")
            if not href.startswith("http"):
                href = f"{_ADM_BASE}/{href.lstrip('/')}"
            source = urllib.parse.urlparse(href).netloc.removeprefix("www.")
            links.append({"source": source, "url": href})
        return links
    except Exception:
        return []


# ── SearXNG ───────────────────────────────────────────────────────────────────

def _searxng(query: str) -> list[str]:
    try:
        resp = requests.get(
            f"{_SEARXNG_URL}/search",
            params={"q": query, "format": "json", "categories": "general"},
            timeout=8,
        )
        return [r["url"] for r in resp.json().get("results", [])[:8]]
    except Exception:
        return []


# ── Browser page fetch ────────────────────────────────────────────────────────

async def _fetch(browser, url: str) -> tuple[str, str]:
    """Navigate to url, wait for JS render, return (final_url, html)."""
    try:
        tab = await browser.get(url)
        await asyncio.sleep(random.uniform(2.5, 4.0))
        html = await tab.evaluate("document.documentElement.outerHTML")
        final_url = tab.url
        await tab.close()
        return final_url or "", html or ""
    except Exception:
        return "", ""


# ── Metacritic ────────────────────────────────────────────────────────────────

async def _mc_find(browser, artist: str, album: str) -> tuple[str, str]:
    direct = f"https://www.metacritic.com/music/{_slug(album)}/{_slug(artist)}"
    final_url, html = await _fetch(browser, direct)
    if "metacritic.com/music/" in final_url and html:
        return final_url, html

    for a_var in _name_variations(artist)[:2]:
        for al_var in _name_variations(album)[:2]:
            url = f"https://www.metacritic.com/music/{_slug(al_var)}/{_slug(a_var)}"
            if url == direct:
                continue
            final_url, html = await _fetch(browser, url)
            if "metacritic.com/music/" in final_url and html:
                return final_url, html

    for candidate in _searxng(f"site:metacritic.com/music {artist} {album}"):
        if "metacritic.com/music/" in candidate:
            final_url, html = await _fetch(browser, candidate)
            if "metacritic.com/music/" in final_url and html:
                return final_url, html

    return "", ""


def _mc_parse(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    data: dict = {"metacritic_url": url}
    text = soup.get_text()

    for sel in (
        "div.metascore_w", "span.metascore_w",
        ".c-siteReviewScore_background-critic_medium",
        ".c-siteReviewScore_background-critic_large",
        '[class*="metascore"]',
        '[class*="c-siteReviewScore"]',
    ):
        el = soup.select_one(sel)
        if el:
            m = re.search(r"\d+", el.get_text())
            if m:
                data["metacritic_score"] = int(m.group())
                break

    for pat in (r"Based on (\d+) Critic Review", r"(\d+) Critic Review"):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            data["metacritic_num_critics"] = int(m.group(1))
            break

    for key, patterns in (
        ("metacritic_positive", [r"(\d+)\s+Positive", r"Positive[:\s]+(\d+)"]),
        ("metacritic_mixed",    [r"(\d+)\s+Mixed",    r"Mixed[:\s]+(\d+)"]),
        ("metacritic_negative", [r"(\d+)\s+Negative", r"Negative[:\s]+(\d+)"]),
    ):
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                data[key] = int(m.group(1))
                break

    return data


# ── Album of the Year ─────────────────────────────────────────────────────────

async def _aoty_find(browser, artist: str, album: str) -> tuple[str, str]:
    for candidate in _searxng(f"site:albumoftheyear.org {artist} {album}"):
        if "albumoftheyear.org" in candidate and "/album/" in candidate:
            final_url, html = await _fetch(browser, candidate)
            if final_url and html:
                return final_url, html
    return "", ""


def _aoty_score_from(soup: BeautifulSoup, selectors: list[str]) -> int | None:
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            m = re.search(r"(\d+(?:\.\d+)?)", el.get_text())
            if m:
                v = float(m.group(1))
                return int(v * 10 if v <= 10 else v)
    return None


def _aoty_parse(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    data: dict = {"aoty_url": url}
    text = soup.get_text()

    user = _aoty_score_from(soup, [".userScore", ".albumUserScore", 'div[class*="userScore"]'])
    critic = _aoty_score_from(soup, [".criticScore", ".albumCriticScore", 'div[class*="criticScore"]'])

    if user is not None:
        data["aoty_user_score"] = user
    if critic is not None:
        data["aoty_critic_score"] = critic
        data["aoty_score"] = critic

    for key, patterns in (
        ("aoty_num_user_ratings",   [r"(\d+)\s+user\s+rating", r"(\d+)\s+rating"]),
        ("aoty_num_critic_ratings", [r"(\d+)\s+critic\s+review", r"(\d+)\s+review"]),
    ):
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                data[key] = int(m.group(1))
                break

    return data


# ── Public API ────────────────────────────────────────────────────────────────

async def _enrich_async(artist: str, album: str) -> dict:
    browser = await _get_browser()
    mc_url, mc_html = await _mc_find(browser, artist, album)
    mc = _mc_parse(mc_url, mc_html) if mc_url else {}
    await asyncio.sleep(random.uniform(1.5, 3.0))
    aoty_url, aoty_html = await _aoty_find(browser, artist, album)
    at = _aoty_parse(aoty_url, aoty_html) if aoty_url else {}
    return {**mc, **at}


def enrich_reviews(artist: str, album: str) -> dict:
    try:
        result = _run(_enrich_async(artist, album))
    except Exception:
        result = {}
    links = _adm_search(artist, album)
    if links:
        result["review_links"] = links
    return result
