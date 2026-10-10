import type { LyricLine } from "../types/performance";
import { lyricIndexAt } from "../lib/beat";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  time: number;
  /** High-energy section: the current line gets a soft glow. Presentation only. */
  energetic?: boolean;
}

/** The current line, large, with the next line previewed underneath. */
export default function LyricsDisplay({ lyrics, time, energetic = false }: LyricsDisplayProps) {
  const index = lyricIndexAt(lyrics, time);
  const current = index >= 0 ? lyrics[index] : null;
  const next = lyrics.find((line) => line.start > time);

  return (
    <div className="flex min-h-28 flex-col justify-center text-center">
      {/* The live region stays mounted so screen readers announce each new line; the inner span fades it in. */}
      <p
        aria-live="polite"
        className={`font-display text-2xl leading-snug font-bold text-ink transition-[text-shadow] duration-700 sm:text-[2rem] ${
          energetic ? "[text-shadow:0_0_22px_rgba(124,247,212,0.35)]" : ""
        }`}
      >
        <span key={index} className="inline-block animate-lyric-in">
          {current ? current.text : <span className="text-ink-muted/60">♪</span>}
        </span>
      </p>
      {next && next !== current && <p className="mt-2 text-base text-ink-muted/80">{next.text}</p>}
    </div>
  );
}
