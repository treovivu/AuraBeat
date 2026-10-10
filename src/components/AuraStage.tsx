interface AuraStageProps {
  beatIndex: number;
  phase: number;
  intensity: number;
  playing: boolean;
  enabled: boolean;
  reducedMotion: boolean;
  /** Tint the whole orb amber (anticipation) instead of only on downbeats. */
  amber?: boolean;
}

/**
 * Placeholder performance used when no video is configured (development mock):
 * an orb that pulses on every beat and flares warm on the downbeat. Fills its parent.
 * The bar position is shown by BeatIndicator, below the performance.
 */
export default function AuraStage({ beatIndex, phase, intensity, playing, enabled, reducedMotion, amber }: AuraStageProps) {
  const active = enabled && playing && beatIndex >= 0;
  const pulse = active ? Math.pow(1 - phase, 3) * intensity : 0;
  const downbeat = amber || (beatIndex >= 0 && beatIndex % 4 === 0);

  // Reduced motion keeps the brightness cue but drops the scaling.
  const scale = reducedMotion ? 1 : 1 + 0.25 * pulse;

  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {enabled && (
        <>
          <div
            className={`absolute size-56 rounded-full blur-3xl sm:size-80 ${downbeat ? "bg-anticipate" : "bg-aura"}`}
            style={{ transform: `scale(${scale})`, opacity: 0.15 + 0.6 * pulse }}
          />
          <div
            className={`absolute size-32 rounded-full border-2 sm:size-44 ${downbeat ? "border-anticipate" : "border-aura"}`}
            style={{ transform: `scale(${reducedMotion ? 1 : 1 + 0.5 * (1 - phase)})`, opacity: active ? 0.6 * pulse : 0 }}
          />
        </>
      )}
    </div>
  );
}
