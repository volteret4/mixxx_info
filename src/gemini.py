import json
import os

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from .db import Song

_PROMPT = """\
You are a music historian and sample archaeologist.
Return a strict JSON object with these keys:
- "historical_context": 2-3 sentences on the track's cultural/musical significance
- "main_sample_context": if this track samples another work, explain the original and why it was chosen (null otherwise)
- "production_notes": notable production techniques, instruments, or studio tricks
- "sources": list of URLs or named databases you drew from (required — do not omit)

Track: "{artist}" — "{title}" (Album: "{album}", Year: {year})

Respond ONLY with valid JSON. No markdown fences, no text outside the JSON object.\
"""


def enrich_with_gemini(song: Song, session: Session):
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    prompt = _PROMPT.format(
        artist=song.artist or "Unknown",
        title=song.title or "Unknown",
        album=song.album or "Unknown",
        year=song.year or "Unknown",
    )

    try:
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        data = json.loads(response.text)
        song.gemini_context = json.dumps({
            "historical_context": data.get("historical_context"),
            "main_sample_context": data.get("main_sample_context"),
            "production_notes": data.get("production_notes"),
        }, ensure_ascii=False)
        song.gemini_sources = data.get("sources", [])
        session.commit()
    except (json.JSONDecodeError, Exception):
        # Leave existing data intact; will be retried on next run
        session.rollback()
