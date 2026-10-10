import type { SectionMood, Track, TrackSection, VisualCue } from "../types/performance";
import { beatPosition } from "./beat";

export type StageTone = "aura" | "amber";

export interface StageLook {
  /** Base colour of the stage light. */
  tone: StageTone;
  /** 0–1 stage light: a held glow that scales with energy, plus the beat hit. */
  level: number;
  /** 0–1 brief warm accent on downbeats of energetic sections. */
  accent: number;
}

/**
 * Shape of one beat's light, from the beat (phase 0) to the next (phase 1).
 * Normal: a quick hit that decays, like a lighting cue. Gentle (Reduce Motion): a smooth swell
 * with no hard attack, so brightness never jumps.
 */
export function beatEnvelope(phase: number, gentle: boolean): number {
  return gentle ? 0.25 + 0.25 * Math.cos(2 * Math.PI * phase) : Math.pow(1 - phase, 3);
}

/**
 * Turns the musical moment into stage light. Downbeats hit harder than other beats, energy follows
 * the section, and amber is kept for anticipation and the downbeats of energetic sections.
 * Levels are capped well below the movement celebration, which always reads as the strongest light.
 */
export function stageLook(mood: SectionMood, intensity: number, beatPulse: number, downbeat: boolean): StageLook {
  const boost = mood === "finale" ? 1.15 : mood === "restrained" ? 0.7 : 1;
  const energy = Math.min(1, intensity * boost);
  const hit = beatPulse * (downbeat ? 1 : 0.6);
  const level = Math.min(1, energy * (0.3 + 0.7 * hit));
  const warm = mood === "rising" || mood === "anticipation" || mood === "peak" || mood === "finale";
  const accent = downbeat && warm ? beatPulse * energy : 0;
  return { tone: mood === "anticipation" ? "amber" : "aura", level, accent };
}

/** Moods where the lightstick pulses with the beat instead of resting. */
export const isHighEnergy = (mood: SectionMood) => mood === "peak" || mood === "finale";

export interface VisualPulse {
  /** 0–1 light pulse right now. */
  value: number;
  /** Increments on every visual pulse (beats, plus half-beats when subdivided); -1 before the first beat. */
  index: number;
  /** True on beat 1 of the bar (not on half-beats). */
  downbeat: boolean;
  /** True on a full beat rather than a half-beat. */
  onBeat: boolean;
}

/** How long a prepared accent cue lights up, in seconds. */
const CUE_DECAY = 0.3;

function cuePulse(cues: VisualCue[], time: number): number {
  let value = 0;
  for (const cue of cues) {
    if (cue.time > time) break;
    const age = time - cue.time;
    if (age < CUE_DECAY) value = Math.max(value, cue.strength * Math.pow(1 - age / CUE_DECAY, 3));
  }
  return value;
}

/**
 * The light pulse at `time`: the beat grid, subdivided in energetic sections (half-beats pulse at 70%),
 * plus any prepared accent cues. Gentle mode (Reduce Motion) keeps one smooth swell per beat and skips
 * the extra pulses so brightness never changes quickly.
 */
export function visualPulse(
  track: Track,
  section: TrackSection,
  time: number,
  options: { gentle: boolean; cues: boolean },
): VisualPulse {
  const { index: beat, phase } = beatPosition(track, time);
  if (beat < 0) return { value: 0, index: -1, downbeat: false, onBeat: false };
  const sub = options.gentle ? 1 : (section.visualSubdivision ?? 1);
  const position = (beat + phase) * sub;
  const index = Math.floor(position);
  const onBeat = index % sub === 0;
  let value = beatEnvelope(position - index, options.gentle) * (onBeat ? 1 : 0.7);
  if (options.cues && !options.gentle && track.visualCues) value = Math.max(value, cuePulse(track.visualCues, time));
  return { value, index, downbeat: onBeat && beat % 4 === 0, onBeat };
}
