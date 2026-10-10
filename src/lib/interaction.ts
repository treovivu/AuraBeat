import type { InteractionCue, Track } from "../types/performance";

export type InteractionPhase = "idle" | "get-ready" | "wave";

/** Where we are relative to the track's interaction moments at `time`. */
export function interactionAt(track: Track, time: number): { phase: InteractionPhase; cue: InteractionCue | null } {
  for (const cue of track.interactions) {
    if (time >= cue.start && time < cue.end) return { phase: "wave", cue };
    if (time >= cue.readyAt && time < cue.start) return { phase: "get-ready", cue };
  }
  return { phase: "idle", cue: null };
}
