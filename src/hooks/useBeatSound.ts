import { useEffect } from "react";
import type { Track } from "../types/performance";
import { beatLength, beatPosition, beatTime, sectionAt } from "../lib/beat";
import { getAudioContext, playClick, playHat, playKick } from "../lib/audio";

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const INTERVAL_MS = 25;

/**
 * Plays a synthesized beat in time with the playback clock.
 * Beats are scheduled slightly ahead on the AudioContext timeline so they land precisely.
 * "music": kick + hi-hat (the mock performance). "metronome": a click per beat, accented on the downbeat.
 */
export function useBeatSound(
  track: Track,
  enabled: boolean,
  playing: boolean,
  getTime: () => number,
  mode: "music" | "metronome" = "music",
) {
  useEffect(() => {
    if (!enabled || !playing) return;
    const context = getAudioContext();
    const half = beatLength(track) / 2;
    // Last scheduled half-beat (even = on-beat kick, odd = off-beat hat).
    let last = beatPosition(track, getTime()).index * 2;

    const schedule = () => {
      const now = getTime();
      const currentHalf = Math.floor((now - track.firstBeat) / half);
      // A seek moved the clock: re-sync instead of firing a burst of missed beats.
      if (last < currentHalf - 1 || last > currentHalf + 2) last = currentHalf;

      while (true) {
        const next = last + 1;
        const at = beatTime(track, 0) + next * half;
        if (at > now + LOOKAHEAD || at > track.duration) break;
        last = next;
        if (at < now) continue;
        const when = context.currentTime + (at - now);
        const { intensity } = sectionAt(track, at);
        if (mode === "metronome") {
          if (next % 2 === 0) playClick(when, (next / 2) % 4 === 0);
        } else if (next % 2 === 0) {
          const downbeat = (next / 2) % 4 === 0;
          playKick(when, (downbeat ? 0.9 : 0.6) * (0.5 + intensity / 2));
        } else if (intensity >= 0.5) {
          playHat(when, 0.12 * intensity);
        }
      }
    };

    schedule();
    const id = window.setInterval(schedule, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [track, enabled, playing, getTime, mode]);
}
