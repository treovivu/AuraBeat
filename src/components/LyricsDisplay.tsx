import type { LyricLine } from "../types/performance";
import { lyricIndexAt } from "../lib/beat";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  time: number;
}

/** The current line, large, with the next line previewed underneath. */
export default function LyricsDisplay({ lyrics, time }: LyricsDisplayProps) {
  const index = lyricIndexAt(lyrics, time);
  const current = index >= 0 ? lyrics[index] : null;
  const next = lyrics.find((line) => line.start > time);

  return (
    <div className="flex min-h-28 flex-col justify-center text-center">
      <p aria-live="polite" className="font-display text-2xl leading-snug font-bold text-ink sm:text-3xl">
        {current ? current.text : <span className="text-ink-muted/60">♪</span>}
      </p>
      {next && next !== current && <p className="mt-2 text-base text-ink-muted">{next.text}</p>}
    </div>
  );
}
