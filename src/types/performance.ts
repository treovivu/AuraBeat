/**
 * How a section should feel on stage. Components map moods to light — they never
 * need to know which song is playing.
 * - restrained: dark, quiet (intros, outros)
 * - cool: mint/aura light, lower energy (verses)
 * - rising: energy ramps toward the next section (builds)
 * - anticipation: amber accents, held tension (pre-hooks)
 * - peak: bright concert light, lightstick pulses (hooks/choruses)
 * - finale: the strongest section of the performance
 */
export type SectionMood = "restrained" | "cool" | "rising" | "anticipation" | "peak" | "finale";

export interface TrackSection {
  /** Seconds from the start of the track. A section runs until the next one starts. */
  start: number;
  label: string;
  /** 0–1. Drives light, lightstick and haptic strength. */
  intensity: number;
  mood: SectionMood;
  /**
   * Visual/haptic pulses per musical beat: 1 = one per beat, 2 = also on the half-beat (double-time
   * feel). The musical BPM is unchanged. Defaults to 1.
   */
  visualSubdivision?: 1 | 2;
}

/** A prepared accent for the lights, at a precise performance time. */
export interface VisualCue {
  time: number;
  /** 0–1 */
  strength: number;
}

export interface LyricLine {
  start: number;
  end: number;
  text: string;
}

/** A moment where the audience is invited to wave with the music. */
export interface InteractionCue {
  id: string;
  /** Internal name, shown only in developer tools. */
  label?: string;
  /** When "Get ready" appears, in seconds. */
  readyAt: number;
  /** The window in which a wrist wave counts. */
  start: number;
  end: number;
}

/** A prerecorded/licensed performance video. Its currentTime drives every cue. */
export interface PerformanceMediaSource {
  src: string;
  poster?: string;
  type?: string;
}

export interface Track {
  title: string;
  artist: string;
  /** Used for beat-synced light and haptics. */
  bpm: number;
  /** Time of the first beat, in seconds. Derive it from `downbeatAnchor` when one is known. */
  firstBeat: number;
  /** A time (s) known to be a downbeat — the reference the beat grid is calibrated from. */
  downbeatAnchor?: number;
  /** Optional precise accents layered over the beat grid (e.g. for the demo section). */
  visualCues?: VisualCue[];
  duration: number;
  sections: TrackSection[];
  /** May be empty while captions are being prepared; the lyrics area then stays hidden. */
  lyrics: LyricLine[];
  /** Where this track's timed lyrics live. DEV shows it as a hint while `lyrics` is empty. */
  lyricsFile?: string;
  /** Untimed lyric lines, one per sung line, for the DEV lyric sync tool. */
  lyricDraft?: string[];
  /** Where `lyricDraft` is edited. */
  lyricDraftFile?: string;
  interactions: InteractionCue[];
  /** When absent, the track plays on the mock clock with the placeholder stage. */
  media?: PerformanceMediaSource;
  /** This track's config file, where DEV calibration tools save beat and interaction timings. */
  configFile?: string;
  /** True for development-only tracks with no real performance behind them. */
  isMock?: boolean;
}
