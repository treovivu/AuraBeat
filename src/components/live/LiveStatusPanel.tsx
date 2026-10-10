import type { LiveConnection } from "../../live/liveBridge";
import type { WatchStatus } from "../../lib/watchBridge";

interface LiveStatusPanelProps {
  connection: LiveConnection;
  watch: WatchStatus;
  /** True when the watch connection is the DEV mock. */
  watchMock: boolean;
}

type Level = "ok" | "wait" | "off";

const DOT: Record<Level, string> = {
  ok: "bg-aura shadow-[0_0_10px_2px] shadow-aura/60",
  wait: "bg-anticipate",
  off: "bg-white/25",
};

function Row({ label, level, value }: { label: string; level: Level; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex items-center gap-2 text-right text-sm font-semibold text-ink">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${DOT[level]}`} />
        {value}
      </span>
    </div>
  );
}

/** Honest connection states: live audio, watch and backend — never claims a link it doesn't have. */
export default function LiveStatusPanel({ connection, watch, watchMock }: LiveStatusPanelProps) {
  const mock = connection.source === "mock" ? " (mock)" : "";

  const audio: [Level, string] =
    connection.backend !== "connected"
      ? ["off", "Not available"]
      : connection.audio === "listening"
        ? ["ok", `Listening${mock}`]
        : connection.audio === "lost"
          ? ["wait", "Signal lost"]
          : ["wait", "Waiting for audio"];

  const backend: [Level, string] =
    connection.backend === "connected"
      ? ["ok", `Connected${mock}`]
      : connection.backend === "connecting"
        ? ["wait", "Connecting…"]
        : ["off", "Disconnected"];

  const watchRow: [Level, string] =
    watch === "connected"
      ? ["ok", watchMock ? "Connected (mock)" : "Connected"]
      : watch === "simulated"
        ? ["wait", "Simulated (development)"]
        : ["off", "Disconnected"];

  return (
    <section aria-label="Connection status" className="divide-y divide-white/10 rounded-3xl border border-white/10 bg-surface px-5 py-1">
      <Row label="Live audio" level={audio[0]} value={audio[1]} />
      <Row label="Watch" level={watchRow[0]} value={watchRow[1]} />
      <Row label="AuraBeat backend" level={backend[0]} value={backend[1]} />
    </section>
  );
}
