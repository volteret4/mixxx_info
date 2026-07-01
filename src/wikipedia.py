import time

import requests
from bs4 import BeautifulSoup

_HEADERS = {"User-Agent": "mixxx_info/0.1 +viciosmusicales@gmail.com"}


def get_content(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        content_div = soup.find("div", {"id": "mw-content-text"})
        if not content_div:
            return None
        for tag in content_div.find_all(
            ["div", "table"], class_=["navbox", "infobox", "toc", "metadata", "tmbox", "ambox"]
        ):
            tag.decompose()
        paragraphs = [p.get_text().strip() for p in content_div.find_all("p")]
        return "\n\n".join(p for p in paragraphs if p) or None
    except Exception:
        return None


def search(query: str, lang: str = "es") -> str | None:
    """Find a Wikipedia URL via the OpenSearch API. Prefers Spanish, falls back to English."""
    for l in ([lang, "en"] if lang != "en" else ["en"]):
        try:
            resp = requests.get(
                f"https://{l}.wikipedia.org/w/api.php",
                params={"action": "opensearch", "search": query, "limit": 1, "format": "json"},
                headers=_HEADERS,
                timeout=10,
            )
            data = resp.json()
            if len(data) > 3 and data[3]:
                return data[3][0]
        except Exception:
            continue
    return None


def _via_wikidata(wikidata_url: str) -> str | None:
    try:
        entity_id = wikidata_url.rstrip("/").split("/")[-1]
        if not entity_id.startswith("Q"):
            return None
        resp = requests.get(
            "https://www.wikidata.org/w/api.php",
            params={"action": "wbgetentities", "ids": entity_id, "format": "json", "props": "sitelinks"},
            headers=_HEADERS,
            timeout=10,
        )
        sitelinks = resp.json().get("entities", {}).get(entity_id, {}).get("sitelinks", {})
        for lang_code in ("eswiki", "enwiki"):
            if lang_code in sitelinks:
                title = sitelinks[lang_code]["title"].replace(" ", "_")
                lang_prefix = "es" if lang_code == "eswiki" else "en"
                return f"https://{lang_prefix}.wikipedia.org/wiki/{title}"
    except Exception:
        pass
    return None


def url_from_mb_id(mb_id: str, entity_type: str) -> str | None:
    """
    Resolve a Wikipedia URL for a MusicBrainz entity.
    Chain: MB url-rels → wikipedia direct → wikidata sitelinks.
    """
    try:
        resp = requests.get(
            f"https://musicbrainz.org/ws/2/{entity_type}/{mb_id}",
            params={"inc": "url-rels", "fmt": "json"},
            headers=_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        time.sleep(1.0)  # MusicBrainz rate limit
        wikidata_url = None
        for rel in resp.json().get("relations", []):
            resource = rel.get("url", {}).get("resource", "")
            if "wikipedia.org" in resource:
                return resource
            if "wikidata.org" in resource:
                wikidata_url = resource
        if wikidata_url:
            return _via_wikidata(wikidata_url)
    except Exception:
        pass
    return None
