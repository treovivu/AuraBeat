import { memo } from "react";

interface AuraEnergyProps {
  /** 0–1 how alive the concert feels right now, from the app's section intensity and mood. */
  energy: number;
  /** True during the app's celebration after a wrist wave: a temporary surge. */
  celebrating: boolean;
  /** Changes on each celebration so the surge shimmer replays. */
  celebrationKey?: number;
  reducedMotion: boolean;
}

/**
 * Aura Energy: a ribbon of light under the stage that widens and brightens as the concert comes
 * alive and surges gold when the audience moves with the music. Not a score — no numbers, no fill
 * target; it simply mirrors the moment and settles back with the music.
 */
export default memo(function AuraEnergy({ energy, celebrating, celebrationKey, reducedMotion }: AuraEnergyProps) {
  const level = celebrating ? 1 : energy;
  const width = 18 + 82 * level;
  const brightness = Math.min(1, 0.3 + 0.65 * level);

  return (
    <div aria-hidden="true" className="relative mx-auto flex h-4 w-full max-w-4xl items-center justify-center">
      {/* Soft halo */}
      <div
        className={`absolute h-3 rounded-full blur-md transition-[width,background-color] duration-1000 ${
          celebrating ? "bg-anticipate/70" : "bg-aura/50"
        }`}
        style={{ width: `${width * 0.9}%`, opacity: brightness }}
      />
      {/* Core ribbon */}
      <div
        className={`relative h-[2px] overflow-hidden rounded-full bg-gradient-to-r from-transparent to-transparent transition-[width] duration-1000 ${
          celebrating ? "via-anticipate" : "via-aura"
        }`}
        style={{ width: `${width}%`, opacity: Math.min(1, brightness + 0.2) }}
      >
        {celebrating && !reducedMotion && (
          <span
            key={celebrationKey}
            className="absolute inset-y-0 left-0 w-full animate-shimmer bg-gradient-to-r from-transparent via-ink to-transparent"
          />
        )}
      </div>
    </div>
  );
});
