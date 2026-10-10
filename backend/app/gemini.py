"""Google Gemini listens to a song and describes it for Deaf and hard-of-hearing fans.

Gemini hears the actual audio and returns:
  - sections with start/end times, a mood, and a short description of what it sounds like
    ("bass drops, crowd-style chant"), which become the words shown on the phone at BUILD/DROP/CHORUS
  - notable sound moments ("[heavy 808 hit]", "[vocals cut out]") attached to the nearest cue
  - a one-line summary and genre for the song card

Turned on by an API key from https://aistudio.google.com/apikey :

    export GEMINI_API_KEY="..."
    export GEMINI_MODEL="gemini-3.5-flash"   # optional, this is the default

librosa still decides *when* beats happen (millisecond-accurate). Gemini decides *what the
moments mean*. Without a key the backend works exactly as before.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

log = logging.getLogger("gemini")

DEFAULT_MODEL = "gemini-3.5-flash"

Mood = Literal["restrained", "cool", "rising", "anticipation", "peak", "finale"]


class AISection(BaseModel):
    start_s: float = Field(description="Section start in seconds from the beginning of the song")
    end_s: float = Field(description="Section end in seconds")
    label: str = Field(description="Intro, Verse, Build, Pre-Chorus, Chorus, Drop, Bridge, Outro...")
    mood: Mood
    energy: float = Field(ge=0, le=1, description="0 = silence, 1 = loudest, most intense part")
    description: str = Field(description="What this section sounds and feels like, max 6 words, no lyrics")


class AIMoment(BaseModel):
    t_s: float = Field(description="Time in seconds")
    caption: str = Field(description="Sound caption in square brackets, max 5 words, e.g. [bass drops]")


class SongAnalysis(BaseModel):
    summary: str = Field(description="One sentence on the song's feel, for someone who can't hear it")
    genre: str
    sections: list[AISection]
    moments: list[AIMoment] = Field(description="Up to 12 standout sound moments")


PROMPT = """You are helping Deaf and hard-of-hearing fans feel a concert through light and vibration.
Listen to this whole song carefully.

Return:
1. sections: the song's structure in order, covering the full duration, with start_s/end_s in seconds.
   mood must be one of: restrained (quiet intro/outro), cool (verses), rising (builds),
   anticipation (pre-chorus tension), peak (chorus/drop), finale (the last, biggest peak).
   description: what it SOUNDS and FEELS like, max 6 words. Describe sound, never quote lyrics.
2. moments: up to 12 standout sound events (bass drops, beat stops, crowd noise, big hits, silence),
   each a short caption in square brackets, max 5 words.
3. summary: one sentence on the overall feel. genre: one or two words.

Use seconds as plain numbers (e.g. 76.8). Be precise about when energy changes."""


def enabled() -> bool:
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_MODEL)


def _analyze_sync(audio_path: str, client=None) -> SongAnalysis:
    from google import genai
    from google.genai import types

    client = client or genai.Client()
    uploaded = client.files.upload(file=audio_path)
    resp = client.models.generate_content(
        model=model_name(),
        contents=[PROMPT, uploaded],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SongAnalysis,
            temperature=0.2,
        ),
    )
    parsed = getattr(resp, "parsed", None)
    if isinstance(parsed, SongAnalysis):
        return parsed
    return SongAnalysis.model_validate_json(resp.text)


async def analyze(audio_path: str, client=None) -> SongAnalysis:
    return await asyncio.to_thread(_analyze_sync, audio_path, client)


def sections_for_analyzer(analysis: SongAnalysis) -> list[dict]:
    """Gemini sections in the format scripts/analyze_song.py --sections expects."""
    return [{"start": round(s.start_s, 2), "label": s.label, "mood": s.mood, "description": s.description}
            for s in sorted(analysis.sections, key=lambda s: s.start_s)]


def merge_into_timeline(timeline: dict, analysis: SongAnalysis) -> dict:
    """Put Gemini's words on the timeline's cues. Timing is untouched."""
    sections = sorted(analysis.sections, key=lambda s: s.start_s)
    shown_kinds = {"bass", "build", "drop", "chorus"}  # kinds the phone displays with a hint line

    def section_at(t: float) -> Optional[AISection]:
        best = None
        for s in sections:
            if s.start_s - 2.0 <= t:  # allow Gemini's boundary to be a little late
                best = s
        return best

    for c in timeline["cues"]:
        if c["kind"] in ("build", "drop", "chorus"):
            s = section_at(c["t"])
            if s:
                c["text"] = s.description

    for m in analysis.moments:
        candidates = [c for c in timeline["cues"] if c["kind"] in shown_kinds and abs(c["t"] - m.t_s) <= 1.0]
        if candidates:
            nearest = min(candidates, key=lambda c: abs(c["t"] - m.t_s))
            nearest["text"] = m.caption

    timeline["ai"] = {"model": model_name(), "summary": analysis.summary, "genre": analysis.genre,
                      "sections": [s.model_dump() for s in sections],
                      "moments": [m.model_dump() for m in analysis.moments]}
    return timeline


def save_analysis(name: str, analysis: SongAnalysis, timeline_dir: Path) -> Path:
    path = timeline_dir / f"{name}.ai.json"
    path.write_text(json.dumps(analysis.model_dump(), indent=1))
    return path
