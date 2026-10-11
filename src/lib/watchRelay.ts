import { connectWatch, disconnectWatch, emitMovement, type HapticCue } from "./watchBridge";

/**
 * Connects the web app ("stage") to the watch relay (dev server: /__aurabeat/relay), so a watch — the real
 * watch app or a phone standing in via watch-sim.html — can drive the concert:
 *   watch  → movement_detected → emitMovement("watch")   (the app decides if it counts)
 *   app    → sendHaptic(cue)   → { type: "haptic", pattern, strength } to the watch
 *            (At-home: beat | get-ready | wave | celebrate; Live: beat | bass | build | chorus | drop)
 *   app    → stopHaptics()     → { type: "stop" } to the watch
 * The watch counts as connected only while the relay reports at least one watch.
 * Returns a function that disconnects.
 */
export function startWatchRelay(url = defaultRelayUrl()): () => void {
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let closed = false;
  let watchLinked = false;

  const link = (on: boolean) => {
    if (on === watchLinked) return;
    watchLinked = on;
    if (on) {
      connectWatch({
        sendHaptic: (cue: HapticCue) => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          const message =
            cue.type === "live"
              ? { type: "haptic", pattern: cue.kind, strength: cue.strength }
              : { type: "haptic", pattern: cue.type, strength: cue.type === "beat" ? cue.strength : 1 };
          socket.send(JSON.stringify(message));
        },
        stop: () => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
        },
      });
    } else {
      disconnectWatch();
    }
  };

  const open = () => {
    socket = new WebSocket(url);
    socket.onmessage = (event) => {
      let msg: { type?: string; watches?: number };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.type === "relay-status") link((msg.watches ?? 0) > 0);
      else if (msg.type === "movement_detected") emitMovement("watch");
    };
    socket.onclose = () => {
      link(false);
      if (!closed) retry = window.setTimeout(open, 3000);
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(retry);
    socket?.close();
    link(false);
  };
}

function defaultRelayUrl() {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__aurabeat/relay?role=stage`;
}
