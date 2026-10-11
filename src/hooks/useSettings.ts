import { useEffect, useState } from "react";

export interface SensorySettings {
  visuals: boolean;
  sound: boolean;
  watchHaptics: boolean;
  lyrics: boolean;
  /** Wrist-wave interaction during highlighted moments. */
  playAlong: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = "aurabeat.settings";

function load(): SensorySettings {
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults: SensorySettings = {
    visuals: true,
    sound: true,
    watchHaptics: true,
    lyrics: true,
    playAlong: true,
    reducedMotion: prefersReduced,
  };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved) as Partial<SensorySettings>;
    // Keep only known keys so retired settings don't linger.
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof SensorySettings)[]) {
      if (typeof parsed[key] === "boolean") merged[key] = parsed[key];
    }
    return merged;
  } catch {
    return defaults;
  }
}

/** Sensory preferences, remembered per device. Reduced motion is mirrored onto <html> for the CSS. */
export function useSettings() {
  const [settings, setSettings] = useState<SensorySettings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable (private mode); settings still work for this session.
    }
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings]);

  const toggle = (key: keyof SensorySettings) => setSettings((s) => ({ ...s, [key]: !s[key] }));
  /** Sets one preference to an exact value (e.g. from Nova), rather than flipping it. */
  const set = (key: keyof SensorySettings, value: boolean) => setSettings((s) => ({ ...s, [key]: value }));

  return { settings, toggle, set };
}
