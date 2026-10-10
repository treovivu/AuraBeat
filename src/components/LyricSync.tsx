import { useEffect, useState } from "react";
import type { LyricLine } from "../types/performance";
import { devSave } from "../lib/devSave";

interface LyricSyncProps {
  /** Untimed lyric lines, in sung order. */
  lines: string[];
  /** Where the lines are edited, for the empty-state hint. */
  draftFile: string;
  /** Where the copied output is pasted. */
  targetFile: string;
  /** Reads the performance clock — video.currentTime when a video plays. */
  getTime: () => number;
  duration: number;
  /** Shows the lines timed so far in the normal lyric display, or null to stop previewing. */
  onPreview: (lyrics: LyricLine[] | null) => void;
}

interface Mark {
  start: number;
  /** Set when the line was ended explicitly (an instrumental gap follows). */
  end?: number;
}

/** A line without an explicit end runs until the next line starts; the last one gets this long. */
const LAST_LINE_SECONDS = 5;

const round = (t: number) => Math.round(t * 100) / 100;

function toLyrics(marks: Mark[], lines: string[], duration: number): LyricLine[] {
  return marks.map((mark, i) => ({
    start: mark.start,
    end: mark.end ?? marks[i + 1]?.start ?? round(Math.min(duration, mark.start + LAST_LINE_SECONDS)),
    text: lines[i],
  }));
}

const button = "min-h-8 rounded-lg border border-white/15 px-2 font-semibold text-ink hover:bg-white/5 disabled:opacity-40";

/**
 * DEV-only tool for timing lyrics by ear: while armed, Enter stamps the current performance time as
 * the start of the next line. Output is a LyricLine[] block to paste into the track's lyrics file.
 */
export default function LyricSync({ lines, draftFile, targetFile, getTime, duration, onPreview }: LyricSyncProps) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Which marks were last saved; any new mark makes them unsaved again.
  const [savedMarks, setSavedMarks] = useState<Mark[] | null>(null);
  const saved = savedMarks === marks;

  const next = marks.length;
  const last = marks.at(-1);

  useEffect(() => {
    onPreview(marks.length > 0 ? toLyrics(marks, lines, duration) : null);
  }, [marks, lines, duration, onPreview]);

  const save = async () => {
    try {
      const timed = toLyrics(marks, lines, duration);
      const file = await devSave({ kind: "lyrics", file: targetFile, lyrics: timed });
      setSavedMarks(marks);
      setMessage(`Saved ${timed.length}/${lines.length} lines to ${file}.`);
    } catch (error) {
      setMessage(`Not saved: ${error instanceof Error ? error.message : error}`);
    }
  };

  useEffect(() => () => onPreview(null), [onPreview]);

  const markStart = () => {
    if (next >= lines.length) return setMessage("All lines are timed.");
    const t = round(getTime());
    if (last && t <= (last.end ?? last.start)) return setMessage("That's before the previous mark — Undo, or seek forward.");
    setMessage(null);
    setMarks([...marks, { start: t }]);
  };

  const markEnd = () => {
    if (!last || last.end !== undefined) return;
    const t = round(getTime());
    if (t <= last.start) return setMessage("Line end must be after its start.");
    setMessage(null);
    setMarks([...marks.slice(0, -1), { ...last, end: t }]);
  };

  const undo = () => {
    if (!last) return;
    setMessage(null);
    setMarks(last.end !== undefined ? [...marks.slice(0, -1), { start: last.start }] : marks.slice(0, -1));
  };

  // Enter = next line starts, Shift+Enter = current line ends. Captured so a focused button isn't pressed.
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      // Let text fields keep Enter; sliders and checkboxes (e.g. the seek bar) don't need it.
      if ((e.target as HTMLElement).closest('textarea, select, input:not([type="range"]):not([type="checkbox"])')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) markEnd();
      else markStart();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const copy = () => {
    const timed = toLyrics(marks, lines, duration);
    const body = timed.map((l) => `  { start: ${l.start}, end: ${l.end}, text: ${JSON.stringify(l.text)} },`).join("\n");
    const block = `const timedLyrics: LyricLine[] = [\n${body}\n];`;
    void navigator.clipboard?.writeText(block).then(() =>
      setMessage(`Copied ${timed.length}/${lines.length} lines. Paste over the marked block in ${targetFile}.`),
    );
  };

  if (lines.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-white/10 p-2">
        <p className="font-semibold text-ink">Lyric sync</p>
        <p className="mt-1">Paste lyric lines into {draftFile} to start.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 p-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">Lyric sync</p>
        <span className="tabular-nums">
          {next}/{lines.length} timed
        </span>
      </div>

      {next < lines.length ? (
        <p className="mt-1">
          Next: <span className="text-ink">“{lines[next]}”</span>
        </p>
      ) : (
        <p className="mt-1 text-aura">All lines timed — copy them.</p>
      )}
      {last && (
        <p className="mt-1 tabular-nums">
          Last: line {next} at {last.start.toFixed(2)}s{last.end !== undefined && `, ended ${last.end.toFixed(2)}s`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setArmed(!armed)}
        className={`mt-2 min-h-9 w-full rounded-lg px-2 font-semibold ${armed ? "bg-aura/20 text-aura" : "bg-white/10 text-ink"}`}
      >
        {armed ? "● Syncing — Enter: line starts · Shift+Enter: line ends" : "Start syncing (Enter)"}
      </button>

      <div className="mt-1 grid grid-cols-3 gap-1">
        <button type="button" className={button} onClick={undo} disabled={!last}>
          Undo
        </button>
        <button type="button" className={button} onClick={markEnd} disabled={!last || last.end !== undefined}>
          End line
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            setMarks([]);
            setMessage(null);
          }}
          disabled={!last}
        >
          Reset
        </button>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!last}
        className="mt-1 min-h-10 w-full rounded-lg bg-aura/20 px-2 font-semibold text-aura hover:bg-aura/30 disabled:opacity-40"
      >
        SAVE TO PROJECT
      </button>
      {last && !saved && <p className="mt-1 text-anticipate">Unsaved — timings are lost on reload until you save.</p>}
      <button type="button" className={`${button} mt-1 w-full`} onClick={copy} disabled={!last}>
        Copy Timed Lyrics
      </button>
      {message && <p className="mt-1 text-anticipate">{message}</p>}
    </div>
  );
}
