import { useCallback, useEffect, useRef, useState } from "react";
import { sendHaptic, stopHaptics } from "../lib/watchBridge";
import { onLiveEvent, type LightstickMode, type LiveCueKind } from "./liveBridge";

export interface LiveSettings {
  /** Phone screen acts as a lightstick. */
  lightstick: boolean;
  /** Send haptic cues to the watch (or the phone as a fallback). */
  watchHaptics: boolean;
  /** Show short music cues (BASS, BUILD, CHORUS, DROP). */
  cues: boolean;
}

const SETTINGS_KEY = "aurabeat.live";
const DEFAULTS: LiveSettings = { lightstick: true, watchHaptics: true, cues: true };

function loadSettings(): LiveSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<LiveSettings> | null;
    return { ...DEFAULTS, ...(saved ?? {}) };
  } catch {
    return DEFAULTS;
  }
}

/** Live-mode preferences, remembered per device and kept separate from At-home settings. */
export function useLiveSettings() {
  const [settings, setSettings] = useState<LiveSettings>(loadSettings);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; still applies for this visit.
    }
  }, [settings]);
  const toggle = (key: keyof LiveSettings) => setSettings((s) => ({ ...s, [key]: !s[key] }));
  return { settings, toggle };
}

export type LightTone = "aura" | "amber" | "gold";

export interface LiveFlash {
  id: number;
  /** 0–1 */
  strength: number;
}

/** How long a DROP lights the stick up in celebration before returning to pulse. */
const CELEBRATE_MS = 4000;
/** Photosensitivity safety: never more than three light flashes per second. */
const MIN_FLASH_GAP_MS = 334;

/**
 * The live session: turns incoming live events into the lightstick state, the music cue on screen, and
 * watch haptics. Nothing happens until the session is started, and `stop()` ends it immediately.
 */
export function useLiveSession(settings: LiveSettings) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<LightstickMode>("calm");
  const [tone, setTone] = useState<LightTone>("aura");
  const [flash, setFlash] = useState<LiveFlash | null>(null);
  const [lastCue, setLastCue] = useState<{ kind: LiveCueKind; id: number } | null>(null);
  const [beats, setBeats] = useState(0);
  const [dropId, setDropId] = useState(0);
  const counter = useRef(0);
  const lastFlashAt = useRef(0);

  // A DROP celebrates for a moment, then the stick settles back into pulse.
  useEffect(() => {
    if (dropId === 0) return;
    const timer = window.setTimeout(() => {
      setMode((m) => (m === "celebrate" ? "pulse" : m));
      setTone("aura");
    }, CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [dropId]);

  useEffect(
    () =>
      onLiveEvent((event) => {
        if (!active) return;
        if (event.type === "lightstick") {
          setMode(event.mode);
          if (event.mode === "celebrate") setTone("gold");
          return;
        }
        if (event.type !== "cue") return;

        const strength = event.strength ?? (event.cue === "beat" ? 0.6 : 1);
        if (settings.watchHaptics) {
          if (event.cue === "beat") sendHaptic({ type: "beat", strength, downbeat: false });
          if (event.cue === "bass") sendHaptic({ type: "beat", strength, downbeat: true });
          if (event.cue === "build") sendHaptic({ type: "get-ready" });
          if (event.cue === "chorus") sendHaptic({ type: "wave" });
          if (event.cue === "drop") sendHaptic({ type: "celebrate" });
        }

        if (event.cue === "build") {
          setMode("pulse");
          setTone("amber");
        } else if (event.cue === "chorus") {
          setMode("pulse");
          setTone("aura");
        } else if (event.cue === "drop") {
          setMode("celebrate");
          setTone("gold");
          setDropId((n) => n + 1);
        }

        if (event.cue === "beat" || event.cue === "bass") setBeats((n) => n + 1);
        if (event.cue !== "beat") setLastCue({ kind: event.cue, id: ++counter.current });

        const now = performance.now();
        if (now - lastFlashAt.current >= MIN_FLASH_GAP_MS) {
          lastFlashAt.current = now;
          setFlash({ id: ++counter.current, strength });
        }
      }),
    [active, settings.watchHaptics],
  );

  const start = useCallback(() => setActive(true), []);

  const stop = useCallback(() => {
    stopHaptics();
    setActive(false);
    setMode("calm");
    setTone("aura");
    setFlash(null);
    setLastCue(null);
  }, []);

  // Leaving the screen always stops local haptics.
  useEffect(() => () => stopHaptics(), []);

  return { active, start, stop, mode, tone, flash, lastCue, beats };
}
