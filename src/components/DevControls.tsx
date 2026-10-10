import { useEffect, useState, type ReactNode } from "react";
import type { InteractionPhase } from "../lib/interaction";
import type { WatchStatus } from "../lib/watchBridge";
import type { InteractionCue } from "../types/performance";
import { formatTime } from "../lib/beat";
import { devSave } from "../lib/devSave";

/** A beat grid: tempo plus one time known to be a downbeat. */
export interface BeatTiming {
  bpm: number;
  anchor: number;
}

interface BeatCalibration {
  timing: BeatTiming;
  /** The values from the track config, for Reset. */
  configured: BeatTiming;
  onChange: (timing: BeatTiming) => void;
  /** Reads the performance clock — video.currentTime when a video plays. */
  getTime: () => number;
  /** Current clock time, for display. */
  time: number;
  beatIndex: number;
  /** Visual pulses per beat in the current section. */
  subdivision: number;
  metronome: boolean;
  onMetronomeChange: (on: boolean) => void;
  /** Whether the track has prepared accent cues, and whether they are shown. */
  hasCues: boolean;
  cues: boolean;
  onCuesChange: (on: boolean) => void;
  /** Track config file to save into; without one, only Copy is offered. */
  saveFile?: string;
}

interface DevControlsProps {
  performanceTitle: string;
  /** Other performances to switch to: label and URL. */
  switchTo: { label: string; href: string }[];
  phase: InteractionPhase;
  watchStatus: WatchStatus;
  lastMovement: string | null;
  cues: InteractionCue[];
  /** Seconds before "Get ready" that a jump lands, so the build-up is visible. */
  jumpLeadIn: number;
  onJumpToCue: (cue: InteractionCue) => void;
  onSimulateWave: () => void;
  calibration: BeatCalibration;
  /** Development-only warnings, e.g. missing caption data. */
  notices?: string[];
  /** Extra DEV tools, shown at the bottom of the panel. */
  children?: ReactNode;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

const nudgeButton = "min-h-8 rounded-lg border border-white/15 px-2 font-semibold text-ink tabular-nums hover:bg-white/5";

/**
 * Beat-grid calibration by ear, anchored on a downbeat you mark while listening. Session-only;
 * "Copy calibration" gives the values to save in the track config.
 */
function BeatSync({ calibration }: { calibration: BeatCalibration }) {
  const { timing, configured, onChange, getTime, time, beatIndex, subdivision } = calibration;
  const [copied, setCopied] = useState<string | null>(null);
  // The status belongs to the exact timing it was produced for; any new adjustment makes it stale.
  const [result, setResult] = useState<{ timing: BeatTiming; ok: boolean; text: string } | null>(null);
  const status = result?.timing === timing ? result : null;
  const save = async () => {
    if (!calibration.saveFile) return;
    try {
      const file = await devSave({ kind: "beat", file: calibration.saveFile, ...timing });
      setResult({ timing, ok: true, text: `Saved to ${file}` });
    } catch (error) {
      setResult({ timing, ok: false, text: `Not saved: ${error instanceof Error ? error.message : error}` });
    }
  };
  const setBpm = (bpm: number) => Number.isFinite(bpm) && bpm > 20 && onChange({ ...timing, bpm: round(bpm, 3) });
  const shift = (delta: number) => onChange({ ...timing, anchor: round(timing.anchor + delta, 3) });
  const markDownbeat = () => onChange({ ...timing, anchor: round(getTime(), 3) });
  const changed = timing.bpm !== configured.bpm || timing.anchor !== configured.anchor;
  const snippet = `const BPM = ${timing.bpm};\nconst DOWNBEAT_ANCHOR = ${timing.anchor};`;

  // "D" marks a downbeat while listening — more precise than reaching for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Text fields keep their keys; sliders and checkboxes (e.g. the seek bar) don't type.
      if ((e.target as HTMLElement).closest('textarea, select, input:not([type="range"]):not([type="checkbox"])')) return;
      e.preventDefault();
      onChange({ ...timing, anchor: round(getTime(), 3) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timing, onChange, getTime]);

  return (
    <div className="mt-2 rounded-xl border border-white/10 p-2">
      <p className="font-semibold text-ink">Beat sync</p>
      <p className="mt-1 tabular-nums">
        time <span className="text-ink">{time.toFixed(3)}s</span> · beat <span className="text-ink">{beatIndex}</span>
        {beatIndex >= 0 && (
          <>
            {" "}
            · bar pos <span className="text-ink">{(beatIndex % 4) + 1}/4</span>
            {beatIndex % 4 === 0 && <span className="ml-1 font-semibold text-anticipate">DOWNBEAT</span>}
          </>
        )}
        {" "}· pulse ×{subdivision}
      </p>

      <button
        type="button"
        onClick={markDownbeat}
        className="mt-2 min-h-10 w-full rounded-lg bg-anticipate/20 px-2 font-semibold text-anticipate hover:bg-anticipate/30"
      >
        MARK CURRENT TIME AS DOWNBEAT (D)
      </button>
      <p className="mt-1 flex justify-between tabular-nums">
        Downbeat anchor <span className="text-ink">{timing.anchor.toFixed(3)}s</span>
      </p>
      <p className="mt-1">Shift beat grid</p>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {[-0.05, -0.01, 0.01, 0.05].map((d) => (
          <button key={d} type="button" className={nudgeButton} onClick={() => shift(d)}>
            {d > 0 ? "+" : "−"}
            {Math.abs(d)}s
          </button>
        ))}
      </div>

      <label className="mt-2 flex items-center justify-between gap-2">
        BPM
        <input
          type="number"
          step={0.01}
          value={timing.bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-20 rounded-lg border border-white/15 bg-transparent px-2 py-1 text-right text-ink tabular-nums"
        />
      </label>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {[-0.1, -0.01, 0.01, 0.1].map((d) => (
          <button key={d} type="button" className={nudgeButton} onClick={() => setBpm(timing.bpm + d)}>
            {d > 0 ? "+" : "−"}
            {Math.abs(d)}
          </button>
        ))}
      </div>

      <label className="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={calibration.metronome}
          onChange={(e) => calibration.onMetronomeChange(e.target.checked)}
        />
        Metronome (high click = downbeat)
      </label>
      {calibration.hasCues && (
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" checked={calibration.cues} onChange={(e) => calibration.onCuesChange(e.target.checked)} />
          Accent cues (prepared, demo section)
        </label>
      )}

      {calibration.saveFile && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed}
          className="mt-2 min-h-10 w-full rounded-lg bg-aura/20 px-2 font-semibold text-aura hover:bg-aura/30 disabled:opacity-40"
        >
          SAVE TO PROJECT
        </button>
      )}
      {changed && !status?.ok && (
        <p className="mt-1 text-anticipate">Unsaved — this calibration is lost on reload until you save.</p>
      )}
      {status && <p className={`mt-1 ${status.ok ? "text-aura" : "text-alert"}`}>{status.text}</p>}
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          className={`${nudgeButton} flex-1`}
          onClick={() => {
            void navigator.clipboard?.writeText(snippet).then(() => setCopied(snippet));
          }}
        >
          COPY CALIBRATION
        </button>
        <button type="button" className={`${nudgeButton} flex-1`} disabled={!changed} onClick={() => onChange(configured)}>
          Reset
        </button>
      </div>
      {copied && (
        <pre className="mt-1 rounded-lg bg-white/5 p-2 text-[11px] whitespace-pre-wrap text-ink">
          {copied}
          {"\n"}→ replace the two lines under “paste DEV → Beat sync” in the track config
        </pre>
      )}
    </div>
  );
}

/** Development-only tools. Render behind `import.meta.env.DEV` so they never ship. */
export default function DevControls({
  performanceTitle,
  switchTo,
  phase,
  watchStatus,
  lastMovement,
  cues,
  jumpLeadIn,
  onJumpToCue,
  onSimulateWave,
  calibration,
  notices = [],
  children,
}: DevControlsProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-3 bottom-3 z-50 min-h-10 rounded-full border border-dashed border-alert/60 bg-stage/95 px-4 text-xs font-semibold tracking-widest text-alert"
      >
        DEV
      </button>
    );
  }

  return (
    <aside
      aria-label="Developer controls"
      className="fixed right-3 bottom-3 z-50 max-h-[calc(100dvh-1.5rem)] w-72 overflow-y-auto rounded-2xl border border-dashed border-alert/60 bg-stage/95 p-3 text-xs text-ink-muted shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold tracking-widest text-alert">DEV</p>
        <button type="button" onClick={() => setCollapsed(true)} className="min-h-8 px-2 text-ink-muted hover:text-ink">
          Hide
        </button>
      </div>
      <p>
        Performance: <span className="text-ink">{performanceTitle}</span>
        {switchTo.map((option) => (
          <a key={option.href} href={option.href} className="ml-2 underline hover:text-ink">
            {option.label}
          </a>
        ))}
      </p>
      <p className="mt-1">
        Phase: <span className="text-ink">{phase}</span> · Watch: <span className="text-ink">{watchStatus}</span>
      </p>
      {lastMovement && <p className="mt-1">Last movement: {lastMovement}</p>}
      {notices.map((notice) => (
        <p key={notice} className="mt-1 text-alert">
          ⚠ {notice}
        </p>
      ))}
      <div className="mt-2 flex flex-col gap-2">
        {cues.map((cue) => (
          <button
            key={cue.id}
            type="button"
            onClick={() => onJumpToCue(cue)}
            className="min-h-10 rounded-xl border border-white/15 px-3 font-semibold text-ink hover:bg-white/5"
          >
            Jump to {cue.label ?? cue.id} ({formatTime(Math.max(0, cue.readyAt - jumpLeadIn))})
          </button>
        ))}
        <button
          type="button"
          onClick={onSimulateWave}
          className="min-h-10 rounded-xl bg-alert/20 px-3 font-semibold text-ink hover:bg-alert/30"
        >
          Simulate Wrist Wave
        </button>
      </div>
      {children}
      <BeatSync calibration={calibration} />
    </aside>
  );
}
