import type { LyricLine, Track, TrackSection } from "../types/performance";

export const beatLength = (track: Track) => 60 / track.bpm;

/**
 * The earliest beat at or after 0 s such that `anchor` lands on a downbeat (beat index ≡ 0 mod 4),
 * so a grid can be calibrated from any downbeat in the song, not just the first one.
 */
export function firstBeatFromAnchor(bpm: number, anchor: number, beatsPerBar = 4): number {
  const bar = (60 / bpm) * beatsPerBar;
  return Math.round((((anchor % bar) + bar) % bar) * 1000) / 1000;
}

export const beatTime = (track: Track, index: number) => track.firstBeat + index * beatLength(track);

/** Which beat we are in and how far through it (0–1). Index is -1 before the first beat. */
export function beatPosition(track: Track, time: number): { index: number; phase: number } {
  const rel = time - track.firstBeat;
  if (rel < 0) return { index: -1, phase: 0 };
  const len = beatLength(track);
  const index = Math.floor(rel / len);
  return { index, phase: (rel - index * len) / len };
}

export function sectionAt(track: Track, time: number): TrackSection {
  let current = track.sections[0];
  for (const section of track.sections) {
    if (section.start <= time) current = section;
    else break;
  }
  return current;
}

/** Index of the lyric line showing at `time`, or -1 between lines. */
export function lyricIndexAt(lyrics: LyricLine[], time: number): number {
  return lyrics.findIndex((line) => time >= line.start && time < line.end);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Section intensity at `time`. "Rising" sections ramp smoothly toward the next section's intensity.
 */
export function intensityAt(track: Track, time: number): number {
  const index = track.sections.findLastIndex((s) => s.start <= time);
  const section = track.sections[Math.max(0, index)];
  const next = track.sections[index + 1];
  if (section.mood !== "rising" || !next) return section.intensity;
  const progress = Math.min(1, Math.max(0, (time - section.start) / (next.start - section.start)));
  return section.intensity + (next.intensity - section.intensity) * progress;
}
