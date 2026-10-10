/**
 * Boundary between the Live Concert screen and the AuraBeat backend.
 *
 * The backend (live audio analysis at the venue) pushes events; the UI only listens here, so it does
 * not care whether they come from a WebSocket, a DEV mock, or something else later.
 *
 * Wire format (JSON, one message per event):
 *   { "type": "cue", "cue": "beat" | "bass" | "build" | "chorus" | "drop", "strength"?: 0..1 }
 *   { "type": "lightstick", "mode": "calm" | "pulse" | "celebrate" }
 *   { "type": "audio", "status": "listening" | "lost" }
 */

export type LiveCueKind = "beat" | "bass" | "build" | "chorus" | "drop";
export type LightstickMode = "calm" | "pulse" | "celebrate";
export type BackendStatus = "connected" | "connecting" | "disconnected";
export type LiveAudioStatus = "listening" | "lost" | "unknown";

export type LiveEvent =
  | { type: "cue"; cue: LiveCueKind; strength?: number }
  | { type: "lightstick"; mode: LightstickMode }
  | { type: "audio"; status: Exclude<LiveAudioStatus, "unknown"> };

export interface LiveConnection {
  backend: BackendStatus;
  audio: LiveAudioStatus;
  /** Where the connection comes from: a real backend, or the DEV mock. */
  source: "backend" | "mock" | null;
}

type Listener<T> = (value: T) => void;

let connection: LiveConnection = { backend: "disconnected", audio: "unknown", source: null };
const connectionListeners = new Set<() => void>();
const eventListeners = new Set<Listener<LiveEvent>>();

function setConnection(next: Partial<LiveConnection>) {
  connection = { ...connection, ...next };
  connectionListeners.forEach((l) => l());
}

export const getLiveConnection = () => connection;

export function subscribeLiveConnection(listener: () => void) {
  connectionListeners.add(listener);
  return () => void connectionListeners.delete(listener);
}

export function onLiveEvent(listener: Listener<LiveEvent>) {
  eventListeners.add(listener);
  return () => void eventListeners.delete(listener);
}

/** Deliver an event to the UI. Used by the backend connection and the DEV mock. */
export function emitLiveEvent(event: LiveEvent) {
  if (event.type === "audio") setConnection({ audio: event.status });
  eventListeners.forEach((l) => l(event));
}

const CUES: LiveCueKind[] = ["beat", "bass", "build", "chorus", "drop"];
const MODES: LightstickMode[] = ["calm", "pulse", "celebrate"];

/** Validates one backend message. Unknown or malformed messages are ignored. */
export function parseLiveMessage(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;
  if (msg.type === "cue" && CUES.includes(msg.cue as LiveCueKind)) {
    const strength = typeof msg.strength === "number" ? Math.min(1, Math.max(0, msg.strength)) : undefined;
    return { type: "cue", cue: msg.cue as LiveCueKind, strength };
  }
  if (msg.type === "lightstick" && MODES.includes(msg.mode as LightstickMode)) {
    return { type: "lightstick", mode: msg.mode as LightstickMode };
  }
  if (msg.type === "audio" && (msg.status === "listening" || msg.status === "lost")) {
    return { type: "audio", status: msg.status };
  }
  return null;
}

/**
 * Connects to the backend's live event WebSocket and keeps reconnecting while in use.
 * Returns a function that closes the connection.
 */
export function connectLiveBackend(url: string): () => void {
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let closed = false;

  const open = () => {
    setConnection({ backend: "connecting", source: "backend" });
    socket = new WebSocket(url);
    socket.onopen = () => setConnection({ backend: "connected" });
    socket.onmessage = (message) => {
      try {
        const event = parseLiveMessage(JSON.parse(String(message.data)));
        if (event) emitLiveEvent(event);
      } catch {
        // Not JSON: ignore.
      }
    };
    socket.onclose = () => {
      setConnection({ backend: "disconnected", audio: "unknown" });
      if (!closed) retry = window.setTimeout(open, 3000);
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(retry);
    socket?.close();
    setConnection({ backend: "disconnected", audio: "unknown", source: null });
  };
}

/** DEV only: pretend a backend is (dis)connected, so the UI states can be exercised. */
export function setMockBackend(connected: boolean) {
  setConnection(
    connected
      ? { backend: "connected", audio: "listening", source: "mock" }
      : { backend: "disconnected", audio: "unknown", source: null },
  );
}
