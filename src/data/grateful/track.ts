import type { Track } from "../../types/performance";
import { firstBeatFromAnchor } from "../../lib/beat";
import { gratefulLyrics } from "./lyrics";
import { gratefulLyricText } from "./lyricsText";
import { gratefulVisualCues } from "./visualCues";

/**
 * NEFFEX – "Grateful" (reference: https://www.youtube.com/watch?v=btv1MvqD9AM).
 *
 * Beat timing was measured from the local performance video (public/media): onset detection over the
 * decoded audio fits a constant 75 BPM grid, within ±16 ms across the whole track; kicks and section
 * changes land on beat 1 of each bar (bar = 3.2 s). The grid is anchored on the first Hook's
 * entrance kick, the strongest downbeat in the song — calibrate it by ear with DEV → Beat sync.
 * Section starts marked "measured" sit on the bar line where the energy change happens; the others
 * are still prototype values with no clear boundary in the audio. Fine-tune with DEV → Beat sync.
 * The video's currentTime is the clock all of these are read against.
 */

// ▼ paste DEV → Beat sync → "Copy calibration" here (replace these two lines) ▼
const BPM = 75.03;
const DOWNBEAT_ANCHOR = 76.82;
// ▲

export const gratefulTrack: Track = {
  title: "Grateful",
  artist: "NEFFEX",
  bpm: BPM,
  firstBeat: firstBeatFromAnchor(BPM, DOWNBEAT_ANCHOR),
  downbeatAnchor: DOWNBEAT_ANCHOR,
  duration: 182.4,
  sections: [
    { start: 0, label: "Intro", intensity: 0.3, mood: "restrained" },
    { start: 11.23, label: "Verse", intensity: 0.5, mood: "cool" }, // measured (enters on beat 3 of the bar)
    // Energetic sections pulse on the half-beat too (double-time feel); the musical BPM stays 75.
    { start: 40, label: "Build", intensity: 0.7, mood: "rising", visualSubdivision: 2 }, // prototype
    { start: 64.03, label: "Pre-Hook", intensity: 0.85, mood: "anticipation", visualSubdivision: 2 }, // measured (moderate)
    { start: 76.83, label: "Hook", intensity: 1, mood: "peak", visualSubdivision: 2 }, // measured (strong)
    { start: 102.43, label: "Verse 2", intensity: 0.65, mood: "cool" }, // measured
    { start: 127, label: "Build 2", intensity: 0.85, mood: "rising", visualSubdivision: 2 }, // prototype
    { start: 153.63, label: "Final Hook", intensity: 1, mood: "finale", visualSubdivision: 2 }, // measured (strong)
  ],
  visualCues: gratefulVisualCues,
  lyrics: gratefulLyrics,
  configFile: "src/data/grateful/track.ts",
  lyricsFile: "src/data/grateful/lyrics.ts",
  lyricDraft: gratefulLyricText,
  lyricDraftFile: "src/data/grateful/lyricsText.ts",
  interactions: [
    { id: "grateful-wave-1", label: "First major hook", readyAt: 70, start: 76.62, end: 89.57 },
    { id: "grateful-wave-2", label: "Final hook", readyAt: 149.25, start: 153.31, end: 165.69 },
  ],
};
