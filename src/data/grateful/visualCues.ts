import type { VisualCue } from "../../types/performance";

/**
 * Percussion accents for the demo section (Pre-Hook → first Hook, 64–90 s) of NEFFEX – "Grateful".
 * Derived from the local performance video's audio: onset peaks at ≥35% of the strongest accent in
 * the window, strength normalised 0–1. Many sit off the 75 BPM grid (syncopated kicks, half-beats),
 * which is why the uniform grid alone can feel loose here. Times are video.currentTime seconds.
 * Delete entries (or the whole list) to fall back to the beat grid.
 */
export const gratefulVisualCues: VisualCue[] = [
  { time: 64.43, strength: 0.46 },
  { time: 64.633, strength: 0.5 },
  { time: 65.225, strength: 0.73 },
  { time: 66.426, strength: 0.79 },
  { time: 66.827, strength: 0.92 },
  { time: 67.228, strength: 0.8 },
  { time: 67.628, strength: 0.46 },
  { time: 68.023, strength: 0.71 },
  { time: 68.383, strength: 0.49 },
  { time: 68.83, strength: 0.65 },
  { time: 69.23, strength: 0.59 },
  { time: 69.509, strength: 0.82 },
  { time: 70.02, strength: 1 },
  { time: 70.432, strength: 0.63 },
  { time: 71.03, strength: 0.65 },
  { time: 71.831, strength: 0.47 },
  { time: 72.806, strength: 0.7 },
  { time: 75.627, strength: 0.76 },
  { time: 76.823, strength: 0.67 },
  { time: 77.624, strength: 1 },
  { time: 79.221, strength: 1 },
  { time: 79.621, strength: 1 },
  { time: 79.824, strength: 1 },
  { time: 80.823, strength: 1 },
  { time: 82.425, strength: 1 },
  { time: 83.22, strength: 0.91 },
  { time: 84.021, strength: 1 },
  { time: 85.624, strength: 1 },
  { time: 87.226, strength: 0.98 },
  { time: 88.822, strength: 1 },
  { time: 89.228, strength: 0.63 },
];
