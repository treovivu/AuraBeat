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
 *
 * The lightstick hub's format (see liveLightstickHub in vite.config.ts) is understood too:
 *   { "v": 1, "type": "cue", "payload": { "kind": "beat" | "bass" | "percussion" | "build" | "chorus" | "get_ready" | "wave" | "drop",
 *                                         "intensity": 0..1, "pattern"?: "none" | … } }
 *   { "v": 1, "type": "haptic", "payload": { "cue_id": "…", "pattern": "beat" | "bass" | "build" | "chorus" | "drop" | "none",
 *                                            "intensity": 0..1, "duration_ms": … } }
 * A hub cue with pattern "none" is lighting only (it never vibrates); haptic messages never change the lighting.
 */

export type LiveCueKind = "beat" | "bass" | "build" | "chorus" | "drop";
export type LightstickMode = "calm" | "pulse" | "celebrate";
export type BackendStatus = "connected" | "connecting" | "disconnected";
export type LiveAudioStatus = "listening" | "lost" | "unknown";

export type LiveEvent =
  | { type: "cue"; cue: LiveCueKind; strength?: number; /** False for lighting-only cues. */ haptic?: boolean }
  /** A musical-onset haptic, separate from the lighting. */
  | { type: "haptic"; pattern: LiveCueKind; strength: number; id?: string }
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

/** Lightstick hub cue kinds → Live Concert cues. */
const HUB_CUES: Record<string, LiveCueKind> = {
  beat: "beat",
  percussion: "beat",
  bass: "bass",
  build: "build",
  chorus: "chorus",
  get_ready: "build",
  wave: "chorus",
  drop: "drop",
};

/** Validates one backend message. Unknown or malformed messages are ignored. */
export function parseLiveMessage(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;
  if (msg.v === 1) {
    const payload = (msg.payload && typeof msg.payload === "object" ? msg.payload : {}) as Record<string, unknown>;
    const intensity =
      typeof payload.intensity === "number" && Number.isFinite(payload.intensity)
        ? Math.min(1, Math.max(0, payload.intensity))
        : undefined;
    if (msg.type === "haptic") {
      // "none" is a valid hub pattern that means no vibration.
      if (typeof payload.pattern !== "string" || !CUES.includes(payload.pattern as LiveCueKind)) return null;
      const id = typeof payload.cue_id === "string" ? payload.cue_id : undefined;
      return { type: "haptic", pattern: payload.pattern as LiveCueKind, strength: intensity ?? 0.5, id };
    }
    const cue = msg.type === "cue" && typeof payload.kind === "string" && Object.hasOwn(HUB_CUES, payload.kind) ? HUB_CUES[payload.kind] : undefined;
    if (!cue) return null;
    return { type: "cue", cue, strength: intensity, haptic: payload.pattern !== "none" };
  }
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

/** No cue for this long → the venue audio counts as lost (the mic script sends one at least every 4.5 s). */
const AUDIO_SILENCE_MS = 10000;

/**
 * Connects to the backend's live event WebSocket and keeps reconnecting while in use.
 * Returns a function that closes the connection.
 */
export function connectLiveBackend(url: string): () => void {
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let silence: number | undefined;
  let closed = false;

  const open = () => {
    setConnection({ backend: "connecting", source: "backend" });
    socket = new WebSocket(url);
    socket.onopen = () => setConnection({ backend: "connected" });
    socket.onmessage = (message) => {
      try {
        const event = parseLiveMessage(JSON.parse(String(message.data)));
        if (!event) return;
        // Cues mean the venue audio is being heard; a long silence means it was lost.
        if (event.type === "cue") {
          if (connection.audio !== "listening") setConnection({ audio: "listening" });
          window.clearTimeout(silence);
          silence = window.setTimeout(() => setConnection({ audio: "lost" }), AUDIO_SILENCE_MS);
        }
        emitLiveEvent(event);
      } catch {
        // Not JSON: ignore.
      }
    };
    socket.onclose = () => {
      window.clearTimeout(silence);
      setConnection({ backend: "disconnected", audio: "unknown" });
      if (!closed) retry = window.setTimeout(open, 3000);
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(retry);
    window.clearTimeout(silence);
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
