interface BeatIndicatorProps {
  /** Beat number since the first beat, or -1 before it. */
  beatIndex: number;
  playing: boolean;
  beatsPerBar?: number;
}

/**
 * A quiet four-dot bar counter under the performance. The downbeat dot is larger as well as warmer,
 * so it doesn't rely on colour alone. Decorative: the music itself is the information.
 */
export default function BeatIndicator({ beatIndex, playing, beatsPerBar = 4 }: BeatIndicatorProps) {
  const current = playing && beatIndex >= 0 ? beatIndex % beatsPerBar : -1;

  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-2.5">
      {Array.from({ length: beatsPerBar }, (_, i) => {
        const downbeat = i === 0;
        const on = i === current;
        return (
          <span
            key={i}
            className={`rounded-full ${downbeat ? "size-2.5" : "size-1.5"} ${
              on ? (downbeat ? "bg-anticipate" : "bg-aura") : downbeat ? "bg-white/25" : "bg-white/15"
            }`}
          />
        );
      })}
    </div>
  );
}
