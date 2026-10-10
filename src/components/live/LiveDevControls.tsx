import { useEffect, useState } from "react";
import { emitLiveEvent, setMockBackend, type LightstickMode, type LiveCueKind } from "../../live/liveBridge";
import { connectWatch, disconnectWatch, type HapticCue } from "../../lib/watchBridge";

interface LiveDevControlsProps {
  backendConnected: boolean;
  watchMock: boolean;
  onWatchMockChange: (on: boolean) => void;
}

const CUES: LiveCueKind[] = ["beat", "bass", "build", "chorus", "drop"];
const MODES: LightstickMode[] = ["calm", "pulse", "celebrate"];

const button = "min-h-9 rounded-lg border border-white/15 px-2 font-semibold text-ink hover:bg-white/5";

/**
 * DEV-only mock of the live backend and the watch. Render behind `import.meta.env.DEV`.
 * Events go through the same liveBridge / watchBridge the real integrations will use.
 */
export default function LiveDevControls({ backendConnected, watchMock, onWatchMockChange }: LiveDevControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [autoBeat, setAutoBeat] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [lastHaptic, setLastHaptic] = useState<string | null>(null);

  // Mock beat generator: a stand-in for live beat detection while there is no backend.
  useEffect(() => {
    if (!autoBeat) return;
    let n = 0;
    const id = window.setInterval(() => {
      emitLiveEvent({ type: "cue", cue: n % 4 === 0 ? "bass" : "beat", strength: n % 4 === 0 ? 1 : 0.6 });
      n++;
    }, 60000 / bpm);
    return () => window.clearInterval(id);
  }, [autoBeat, bpm]);

  // The mock watch records what it would have buzzed.
  useEffect(() => {
    if (!watchMock) return;
    connectWatch({
      sendHaptic: (cue: HapticCue) =>
        setLastHaptic(`${cue.type}${cue.type === "beat" ? ` ${cue.strength.toFixed(1)}${cue.downbeat ? " (strong)" : ""}` : ""} @ ${new Date().toLocaleTimeString()}`),
    });
    return () => disconnectWatch();
  }, [watchMock]);

  // Leaving the screen ends the mock backend too.
  useEffect(() => () => setMockBackend(false), []);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-3 bottom-3 z-[60] min-h-10 rounded-full border border-dashed border-alert/60 bg-stage/95 px-4 text-xs font-semibold tracking-widest text-alert"
      >
        DEV
      </button>
    );
  }

  return (
    <aside
      aria-label="Live developer controls"
      className="fixed right-3 bottom-3 z-[60] max-h-[calc(100dvh-1.5rem)] w-72 overflow-y-auto rounded-2xl border border-dashed border-alert/60 bg-stage/95 p-3 text-xs text-ink-muted shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold tracking-widest text-alert">DEV · LIVE MOCK</p>
        <button type="button" onClick={() => setCollapsed(true)} className="min-h-8 px-2 hover:text-ink">
          Hide
        </button>
      </div>

      <p className="mt-2 font-semibold text-ink">Connections</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button type="button" className={button} onClick={() => setMockBackend(!backendConnected)}>
          Backend {backendConnected ? "disconnect" : "connect"}
        </button>
        <button type="button" className={button} onClick={() => onWatchMockChange(!watchMock)}>
          Watch {watchMock ? "disconnect" : "connect"}
        </button>
      </div>
      {watchMock && <p className="mt-1">Mock watch last buzz: {lastHaptic ?? "–"}</p>}

      <p className="mt-3 font-semibold text-ink">Live cues</p>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {CUES.map((cue) => (
          <button key={cue} type="button" className={button} onClick={() => emitLiveEvent({ type: "cue", cue })}>
            {cue}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={autoBeat} onChange={(e) => setAutoBeat(e.target.checked)} />
          Auto beat
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={40}
            max={200}
            value={bpm}
            onChange={(e) => setBpm(Math.min(200, Math.max(40, Number(e.target.value) || 120)))}
            className="w-14 rounded-md border border-white/15 bg-transparent px-1 py-0.5 text-right text-ink"
          />
          BPM
        </span>
      </label>

      <p className="mt-3 font-semibold text-ink">Lightstick state (backend-driven)</p>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {MODES.map((mode) => (
          <button key={mode} type="button" className={button} onClick={() => emitLiveEvent({ type: "lightstick", mode })}>
            {mode}
          </button>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button type="button" className={button} onClick={() => emitLiveEvent({ type: "audio", status: "listening" })}>
          audio listening
        </button>
        <button type="button" className={button} onClick={() => emitLiveEvent({ type: "audio", status: "lost" })}>
          audio lost
        </button>
      </div>
    </aside>
  );
}
