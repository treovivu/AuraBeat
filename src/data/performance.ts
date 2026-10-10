import type { Track } from "../types/performance";
import { demoTrack } from "./demoTrack";
import { gratefulTrack } from "./grateful/track";

export type PerformanceId = "grateful" | "neon-tide";

/** Development/mock fallback. Never has a video. */
export const neonTidePerformance: Track = demoTrack;

/**
 * The main At-home Concert performance. The approved video is configured with
 * VITE_PERFORMANCE_VIDEO_URL (see .env.example); its currentTime drives every cue.
 */
const videoUrl = import.meta.env.VITE_PERFORMANCE_VIDEO_URL as string | undefined;
export const gratefulPerformance: Track = videoUrl ? { ...gratefulTrack, media: { src: videoUrl } } : gratefulTrack;

export const performances: Record<PerformanceId, Track> = {
  grateful: gratefulPerformance,
  "neon-tide": neonTidePerformance,
};

function isPerformanceId(value: unknown): value is PerformanceId {
  return value === "grateful" || value === "neon-tide";
}

/**
 * Which performance plays:
 * 1. DEV only: a `?performance=grateful|neon-tide` URL override, for quick switching.
 * 2. VITE_PERFORMANCE=grateful|neon-tide, if set. Grateful without a video runs as a timeline
 *    preview on the mock clock.
 * 3. Otherwise Grateful when its video is configured, else the Neon Tide mock.
 */
function resolveActivePerformanceId(): PerformanceId {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("performance");
    if (isPerformanceId(fromUrl)) return fromUrl;
  }
  const fromEnv = import.meta.env.VITE_PERFORMANCE as string | undefined;
  if (isPerformanceId(fromEnv)) return fromEnv;
  return videoUrl ? "grateful" : "neon-tide";
}

export const activePerformanceId = resolveActivePerformanceId();
export const activePerformance: Track = performances[activePerformanceId];
