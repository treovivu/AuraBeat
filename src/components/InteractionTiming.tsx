import { useEffect, useState } from "react";
import type { InteractionCue } from "../types/performance";
import { devSave } from "../lib/devSave";

interface InteractionTimingProps {
  /** Timings in use right now (temporary while calibrating). */
  cues: InteractionCue[];
  /** Timings saved in the track config, for comparison and Reset. */
  saved: InteractionCue[];
  onChange: (cues: InteractionCue[]) => void;
  /** Reads the performance clock — video.currentTime when a video plays. */
  getTime: () => number;
  /** Current clock time, for display. */
  time: number;
  /** Track config file to save into; without one, only Copy is offered. */
  saveFile?: string;
}

type Field = "readyAt" | "start" | "end";

const FIELDS: { key: Field; name: string; shortcut: string }[] = [
  { key: "readyAt", name: "Get Ready", shortcut: "G" },
  { key: "start", name: "Wave Start", shortcut: "W" },
  { key: "end", name: "Wave End", shortcut: "E" },
];

const round = (t: number) => Math.round(t * 100) / 100;

const button = "min-h-8 rounded-lg border border-white/15 px-1 font-semibold text-ink hover:bg-white/5";

function problem(cue: InteractionCue): string | null {
  if (cue.readyAt > cue.start) return "Get Ready is after Wave Start — it won't show.";
  if (cue.start >= cue.end) return "Wave End must be after Wave Start.";
  return null;
}

/** Copy-ready `interactions` block for the track config. */
function toConfig(cues: InteractionCue[]): string {
  const items = cues.map(
    (cue) =>
      `  {\n    id: ${JSON.stringify(cue.id)},\n${cue.label ? `    label: ${JSON.stringify(cue.label)},\n` : ""}` +
      `    readyAt: ${cue.readyAt},\n    start: ${cue.start},\n    end: ${cue.end},\n  },`,
  );
  return `interactions: [\n${items.join("\n")}\n],`;
}

/**
 * DEV-only: mark GET READY / WAVE START / WAVE END for each interaction at the exact performance time,
 * replay to check, then copy the result into the track config. G / W / E mark interaction 1.
 */
export default function InteractionTiming({ cues, saved, onChange, getTime, time, saveFile }: InteractionTimingProps) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    if (!saveFile) return;
    try {
      const file = await devSave({ kind: "interactions", file: saveFile, interactions: cues });
      setStatus({ ok: true, text: `Saved to ${file}` });
    } catch (error) {
      setStatus({ ok: false, text: `Not saved: ${error instanceof Error ? error.message : error}` });
    }
  };

  const mark = (index: number, field: Field) => {
    setCopied(false);
    setStatus(null);
    onChange(cues.map((cue, i) => (i === index ? { ...cue, [field]: round(getTime()) } : cue)));
  };

  // G / W / E mark interaction 1 while listening; text fields keep their keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || cues.length === 0) return;
      const field = FIELDS.find((f) => f.shortcut === e.key.toUpperCase());
      if (!field) return;
      if ((e.target as HTMLElement).closest('textarea, select, input:not([type="range"]):not([type="checkbox"])')) return;
      e.preventDefault();
      setCopied(false);
      setStatus(null);
      onChange(cues.map((cue, i) => (i === 0 ? { ...cue, [field.key]: round(getTime()) } : cue)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cues, onChange, getTime]);

  const changed = JSON.stringify(cues) !== JSON.stringify(saved);
  const unsaved = changed && !status?.ok;

  return (
    <div className="mt-2 rounded-xl border border-white/10 p-2">
      <p className="font-semibold text-ink">INTERACTION TIMING</p>
      <p className="mt-1 tabular-nums">
        video.currentTime <span className="text-ink">{time.toFixed(2)}s</span>
      </p>

      {cues.map((cue, index) => {
        const savedCue = saved.find((s) => s.id === cue.id);
        const issue = problem(cue);
        return (
          <div key={cue.id} className="mt-2 border-t border-white/10 pt-2">
            <p className="text-ink">
              {index + 1}. {cue.label ?? cue.id}
            </p>
            <table className="mt-1 w-full tabular-nums">
              <thead>
                <tr className="text-left">
                  <th className="font-normal" />
                  <th className="font-normal">saved</th>
                  <th className="font-normal">now</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((f) => {
                  const value = cue[f.key];
                  const before = savedCue?.[f.key];
                  return (
                    <tr key={f.key}>
                      <td>{f.name}</td>
                      <td>{before?.toFixed(2) ?? "–"}</td>
                      <td className={value !== before ? "font-semibold text-anticipate" : "text-ink"}>{value.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {FIELDS.map((f) => (
                <button key={f.key} type="button" className={button} onClick={() => mark(index, f.key)}>
                  Mark {f.name} {index + 1}
                  {index === 0 && <span className="text-ink-muted"> ({f.shortcut})</span>}
                </button>
              ))}
            </div>
            {issue && <p className="mt-1 text-alert">⚠ {issue}</p>}
          </div>
        );
      })}

      {saveFile && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed}
          className="mt-2 min-h-10 w-full rounded-lg bg-aura/20 px-2 font-semibold text-aura hover:bg-aura/30 disabled:opacity-40"
        >
          SAVE TO PROJECT
        </button>
      )}
      {unsaved && <p className="mt-1 text-anticipate">Unsaved — these timings are lost on reload until you save.</p>}
      {status && <p className={`mt-1 ${status.ok ? "text-aura" : "text-alert"}`}>{status.text}</p>}
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          className={`${button} flex-1`}
          onClick={() => void navigator.clipboard?.writeText(toConfig(cues)).then(() => setCopied(true))}
        >
          COPY BOTH INTERACTIONS
        </button>
        <button
          type="button"
          className={`${button} flex-1`}
          disabled={!changed}
          onClick={() => {
            setCopied(false);
            onChange(saved);
          }}
        >
          RESET INTERACTION TIMING
        </button>
      </div>
      {copied && (
        <p className="mt-1 text-aura">Copied — replace the `interactions: [ … ],` block in the track config.</p>
      )}
    </div>
  );
}
