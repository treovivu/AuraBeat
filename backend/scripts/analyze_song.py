"""Turn a real song into a cue timeline the backend can play in sync.

    python scripts/analyze_song.py media/grateful.mp3 --out timelines/grateful.json
    python scripts/analyze_song.py song.mp3 --out timelines/song.json --sections sections.json

What it finds (librosa, offline, no internet):
  beat      every beat on the detected tempo grid (or --bpm/--anchor if you know them)
  bass      punchy hits where the low end (< 150 Hz) dominates: kicks, 808s
  percussion other punchy hits: snares, claps
  build     start of a rising section (from --sections, else where energy climbs)
  drop      start of a peak section / chorus (from --sections, else biggest energy jumps)
  chorus    sent a bar after a drop, so the lightstick settles into pulse

Needs ffmpeg for mp3/webm/m4a (brew install ffmpeg). WAV works without it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

PINK, BLUE, GOLD, AMBER, WHITE = "#FF3EA5", "#3EA5FF", "#FFC83E", "#FFA53E", "#FFFFFF"


def load(path: str, sr: int = 22050):
    import librosa

    y, sr = librosa.load(path, sr=sr, mono=True)
    return y, sr


def beat_grid(y, sr, bpm: float | None, anchor: float | None, duration: float) -> tuple[float, list[float]]:
    import librosa

    if bpm and anchor is not None:
        step = 60.0 / bpm
        first = anchor - step * int(anchor / step)
        return bpm, [round(t, 3) for t in np.arange(first, duration, step)]
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    times = librosa.frames_to_time(frames, sr=sr)
    tempo = float(np.atleast_1d(tempo)[0])
    return tempo, [round(float(t), 3) for t in times]


def accents(y, sr, min_gap: float = 0.18, threshold: float = 0.45, window: float = 8.0):
    """Punchy hits (kicks, snares, 808s): full-band onset peaks, kept when they're at least
    `threshold` of the strongest hit within ±window seconds, so quiet verses still register.
    Each hit is labelled bass (low end dominates) or percussion. Returns [(time, strength, kind)]."""
    import librosa

    hop = 512
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    if env.max() <= 0:
        return []
    peaks = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10,
                                   delta=0.07 * env.max(), wait=int(min_gap * sr / hop))
    times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
    vals = env[peaks]

    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low_share = S[freqs < 150].sum(axis=0) / np.maximum(S.sum(axis=0), 1e-9)
    typical_low = float(np.median(low_share))

    out = []
    for t, v, f in zip(times, vals, peaks):
        local = vals[(times >= t - window) & (times <= t + window)].max()
        rel = float(v / local)
        if rel < threshold:
            continue
        # Look a few frames after the onset, where the body of a kick sits.
        body = float(low_share[f: f + 4].mean()) if f + 1 < len(low_share) else float(low_share[f])
        kind = "bass" if body >= typical_low * 1.15 else "percussion"
        out.append((round(float(t), 3), round(min(1.0, rel), 2), kind))
    return out


def energy_curve(y, sr, hop: int = 2048):
    import librosa

    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    k = max(1, int(2.0 * sr / hop))  # 2 s smoothing
    smooth = np.convolve(rms, np.ones(k) / k, mode="same")
    return t, smooth / max(smooth.max(), 1e-9)


def auto_sections(t, energy, duration) -> list[dict]:
    """Rough sections when none are given: biggest sustained energy jumps become drops."""
    step = 8.0
    edges = np.arange(0, duration, step)
    means = [float(energy[(t >= a) & (t < a + step)].mean() or 0) for a in edges]
    jumps = [(means[i] - means[i - 1], edges[i]) for i in range(1, len(means))]
    drops = sorted([j for j in jumps if j[0] > 0.12], reverse=True)[:3]
    sections = [{"start": 0.0, "label": "Intro", "mood": "restrained"}]
    for _, start in sorted(drops, key=lambda x: x[1]):
        if start - 16 > 0:
            sections.append({"start": float(start - 16), "label": "Build", "mood": "rising"})
        sections.append({"start": float(start), "label": "Drop", "mood": "peak"})
    return sorted(sections, key=lambda s: s["start"])


def intensity_at(t_now, t, energy) -> float:
    i = int(np.searchsorted(t, t_now))
    return float(energy[min(i, len(energy) - 1)])


STRUCTURAL = {"build", "drop", "chorus"}


def thin(cues: list[dict], min_gap: float = 0.15) -> list[dict]:
    """Two buzzes closer than min_gap feel like one smeared buzz. Keep the stronger rhythmic cue,
    and never let a beat crowd a build/drop/chorus."""
    cues = sorted(cues, key=lambda c: c["t"])
    structural = [c for c in cues if c["kind"] in STRUCTURAL]
    s_times = np.array([c["t"] for c in structural]) if structural else np.array([])
    kept: list[dict] = []
    for c in cues:
        if c["kind"] in STRUCTURAL:
            continue
        if s_times.size and np.min(np.abs(s_times - c["t"])) < min_gap:
            continue
        if kept and c["t"] - kept[-1]["t"] < min_gap:
            if c["intensity"] > kept[-1]["intensity"]:
                kept[-1] = c
            continue
        kept.append(c)
    return sorted(kept + structural, key=lambda c: c["t"])


def build_timeline(path: str, bpm=None, anchor=None, sections=None, title=None) -> dict:
    y, sr = load(path)
    duration = len(y) / sr
    tempo, beats = beat_grid(y, sr, bpm, anchor, duration)
    t, energy = energy_curve(y, sr)
    hits = accents(y, sr)
    sections = sections or auto_sections(t, energy, duration)

    cues: list[dict] = []
    hit_times = np.array([h[0] for h in hits]) if hits else np.array([])

    # Beats: skip the ones an accent already covers, so the watch doesn't double-buzz.
    for b in beats:
        if hit_times.size and np.min(np.abs(hit_times - b)) < 0.09:
            continue
        e = intensity_at(b, t, energy)
        if e < 0.12:
            continue  # silence / fade
        cues.append({"t": b, "kind": "beat", "intensity": round(0.35 + 0.4 * e, 2),
                     "pattern": "tap", "duration_ms": 70, "color": BLUE})

    for ht, s, kind in hits:
        e = intensity_at(ht, t, energy)
        if e < 0.12:
            continue
        strength = round(max(0.5, min(1.0, s * (0.6 + 0.4 * e))), 2)
        if kind == "bass":
            cues.append({"t": ht, "kind": "bass", "intensity": strength,
                         "pattern": "pulse", "duration_ms": 160, "color": PINK})
        else:
            cues.append({"t": ht, "kind": "percussion", "intensity": round(strength * 0.8, 2),
                         "pattern": "tap", "duration_ms": 60, "color": WHITE})

    for s in sections:
        mood, start = s.get("mood"), float(s["start"])
        if mood in ("rising", "anticipation"):
            cues.append({"t": start, "kind": "build", "intensity": 0.7, "pattern": "ramp",
                         "duration_ms": 400, "color": AMBER, "text": s.get("label", "BUILD").upper()})
        elif mood in ("peak", "finale"):
            cues.append({"t": start, "kind": "drop", "intensity": 1.0, "pattern": "long",
                         "duration_ms": 600, "color": GOLD, "text": "DROP"})
            bar = 4 * 60.0 / tempo
            cues.append({"t": round(start + bar, 3), "kind": "chorus", "intensity": 0.8, "pattern": "double_tap",
                         "duration_ms": 200, "color": PINK, "text": s.get("label", "CHORUS").upper()})

    cues = thin(cues)
    return {
        "title": title or Path(path).stem,
        "duration": round(duration, 3),
        "bpm": round(tempo, 2),
        "sections": sections,
        "cues": cues,
        "counts": {k: sum(1 for c in cues if c["kind"] == k)
                   for k in ("beat", "bass", "percussion", "build", "drop", "chorus")},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--bpm", type=float)
    ap.add_argument("--anchor", type=float, help="a time (s) known to be a downbeat")
    ap.add_argument("--sections", help="JSON file: [{start, label, mood}], mood in restrained|cool|rising|anticipation|peak|finale")
    ap.add_argument("--title")
    a = ap.parse_args()
    sections = json.loads(Path(a.sections).read_text()) if a.sections else None
    tl = build_timeline(a.audio, a.bpm, a.anchor, sections, a.title)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(tl, indent=1))
    print(f"{tl['title']}: {tl['duration']} s, {tl['bpm']} BPM, cues {tl['counts']} -> {a.out}")


if __name__ == "__main__":
    main()
