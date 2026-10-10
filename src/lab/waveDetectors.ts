/**
 * JavaScript ports of the watch's wave detectors (watchOS/MotionDetector.swift — same algorithm and defaults), so it can
 * be tried with real human motion on a phone. Units: acceleration in g (1 g = 9.81 m/s²), rotation in °/s,
 * time in seconds.
 */

export interface FixedDetectorSettings {
  /** Wrist rotation speed (°/s) a swing must exceed. */
  rotationThreshold: number;
  /** How long a swing must stay above the threshold (s). */
  minSwingDuration: number;
  /** Alternating swings needed for one wave. */
  swingsForWave: number;
  /** All swings of one wave must happen within this time (s). */
  waveWindow: number;
  /** Pause after a wave before the next can be reported (s). */
  waveCooldown: number;
  /** Whole-body bounce gate: no waves while the gravity-free acceleration RMS (last 0.5 s) is above this (g). */
  bounceGate: number;
}

/**
 * Tuned on real recorded motion (Wave Lab, iPhone held like a watch face): 13/13 trials correct, and
 * neighbouring settings also 13/13. Waving is mostly wrist rotation (forearm roll), not sideways push.
 */
export const DEFAULT_SETTINGS: FixedDetectorSettings = {
  rotationThreshold: 100,
  minSwingDuration: 0.06,
  swingsForWave: 2,
  waveWindow: 1.4,
  waveCooldown: 0.6,
  bounceGate: 0.8,
};

const GATE_WINDOW = 0.5;

/**
 * Wave = alternating wrist-roll swings (rotation around the device's y axis — the forearm when worn),
 * each sustained for a moment, while the body is not bouncing hard.
 */
export class FixedWaveDetector {
  settings: FixedDetectorSettings;
  private currentSign = 0;
  private aboveSince = 0;
  private counted = false;
  private lastSwingSign = 0;
  private swingTimes: number[] = [];
  private lastWaveTime = -Infinity;
  private accel: [number, number][] = [];

  constructor(settings: FixedDetectorSettings = DEFAULT_SETTINGS) {
    this.settings = settings;
  }

  reset() {
    this.currentSign = 0;
    this.counted = false;
    this.lastSwingSign = 0;
    this.swingTimes = [];
    this.accel = [];
  }

  /**
   * Feed one sample: roll rotation rate (°/s) and gravity-free acceleration magnitude (g).
   * Returns "swing" when a swing is counted, "wave" when a wave is detected, "gated" while bouncing.
   */
  process(roll: number, accelMagnitude: number, now: number): "swing" | "wave" | "gated" | null {
    const s = this.settings;

    this.accel.push([now, accelMagnitude]);
    while (this.accel.length && now - this.accel[0][0] > GATE_WINDOW) this.accel.shift();
    const rms = Math.sqrt(this.accel.reduce((sum, [, a]) => sum + a * a, 0) / this.accel.length);
    if (rms > s.bounceGate) {
      this.currentSign = 0;
      this.lastSwingSign = 0;
      this.swingTimes = [];
      return "gated";
    }

    const sign = roll > s.rotationThreshold ? 1 : roll < -s.rotationThreshold ? -1 : 0;
    if (sign === 0 || sign !== this.currentSign) {
      this.currentSign = sign;
      this.aboveSince = now;
      this.counted = false;
      return null;
    }
    if (this.counted || now - this.aboveSince < s.minSwingDuration || sign === this.lastSwingSign) return null;

    this.counted = true;
    this.lastSwingSign = sign;
    this.swingTimes.push(now);
    this.swingTimes = this.swingTimes.filter((t) => now - t <= s.waveWindow);

    if (this.swingTimes.length >= s.swingsForWave && now - this.lastWaveTime > s.waveCooldown) {
      this.lastWaveTime = now;
      this.swingTimes = [];
      return "wave";
    }
    return "swing";
  }
}

/** The original detector (branch `PramitWatchPre`): |raw acceleration incl. gravity| − 1 g > 0.45 g. */
export class OriginalWaveDetector {
  threshold = 0.45;
  cooldown = 0.4;
  private lastWaveTime = -Infinity;

  process(x: number, y: number, z: number, now: number): boolean {
    const magnitude = Math.sqrt(x * x + y * y + z * z) - 1;
    if (magnitude > this.threshold && now - this.lastWaveTime > this.cooldown) {
      this.lastWaveTime = now;
      return true;
    }
    return false;
  }
}
