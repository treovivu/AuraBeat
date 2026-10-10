import type { LyricLine } from "../types/performance";

// "00:01:02,345", "01:02.345" or "1:02:03.4" → seconds
function parseTimestamp(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!match) return null;
  const [, h = "0", m, s, frac] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(frac.padEnd(3, "0")) / 1000;
}

/**
 * Parses SRT or WebVTT captions into lyric lines, sorted by start time.
 * Cue numbers, VTT headers/NOTE/STYLE blocks, cue settings and inline tags are ignored;
 * a multi-line cue becomes one line of text.
 */
export function parseCaptions(source: string): LyricLine[] {
  const blocks = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const lines: LyricLine[] = [];

  for (const block of blocks) {
    const rows = block.split("\n").filter((row) => row.trim() !== "");
    const timingRow = rows.findIndex((row) => row.includes("-->"));
    if (timingRow === -1) continue; // WEBVTT header, NOTE, STYLE, REGION

    const [startText, rest = ""] = rows[timingRow].split("-->");
    const start = parseTimestamp(startText);
    const end = parseTimestamp(rest.trim().split(/\s+/)[0] ?? "");
    const text = rows
      .slice(timingRow + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (start === null || end === null || end <= start || !text) continue;
    lines.push({ start, end, text });
  }

  return lines.sort((a, b) => a.start - b.start);
}
