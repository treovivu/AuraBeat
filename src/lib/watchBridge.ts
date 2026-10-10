/**
 * Boundary between AuraBeat and the Wear OS watch.
 *
 * The real watch/backend integration plugs in through `connectWatch(transport)` and calls
 * `emitMovement()` when the watch detects a wrist wave. The UI only talks to this module,
 * so it never needs to know how the watch is reached.
 */

export type WatchStatus = "connected" | "disconnected" | "simulated";

export interface MovementEvent {
  type: "movement_detected";
  source: "watch" | "simulated";
  /** performance.now() when the movement was detected or received. */
  timestamp: number;
}

export type HapticCue =
  | { type: "beat"; strength: number; downbeat: boolean }
  | { type: "get-ready" }
  | { type: "wave" }
  | { type: "celebrate" };

export interface WatchTransport {
  sendHaptic(cue: HapticCue): void;
}

type Listener<T> = (value: T) => void;

let transport: WatchTransport | null = null;
// Development builds offer simulated movement, and say so; production never claims a watch it doesn't have.
let status: WatchStatus = import.meta.env.DEV ? "simulated" : "disconnected";
const statusListeners = new Set<Listener<WatchStatus>>();
const movementListeners = new Set<Listener<MovementEvent>>();

function setStatus(next: WatchStatus) {
  status = next;
  statusListeners.forEach((l) => l(next));
}

/** Called by the watch integration once a physical watch is reachable. */
export function connectWatch(next: WatchTransport) {
  transport = next;
  setStatus("connected");
}

export function disconnectWatch() {
  transport = null;
  setStatus(import.meta.env.DEV ? "simulated" : "disconnected");
}

export const getWatchStatus = () => status;

export function subscribeWatchStatus(listener: Listener<WatchStatus>) {
  statusListeners.add(listener);
  return () => void statusListeners.delete(listener);
}

/** Deliver a movement to the app. Used by the watch integration and the DEV simulator. */
export function emitMovement(source: MovementEvent["source"]) {
  const event: MovementEvent = { type: "movement_detected", source, timestamp: performance.now() };
  movementListeners.forEach((l) => l(event));
}

export function onMovement(listener: Listener<MovementEvent>) {
  movementListeners.add(listener);
  return () => void movementListeners.delete(listener);
}

export const phoneCanVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

/** Send a haptic cue to the watch. Without one, the phone's vibration is used as a fallback when available. */
export function sendHaptic(cue: HapticCue) {
  if (transport) {
    transport.sendHaptic(cue);
    return;
  }
  if (!phoneCanVibrate) return;
  switch (cue.type) {
    case "beat":
      navigator.vibrate(Math.round((cue.downbeat ? 60 : 30) * (0.5 + cue.strength / 2)));
      break;
    case "get-ready":
      navigator.vibrate([40, 80, 40]);
      break;
    case "wave":
      navigator.vibrate(120);
      break;
    case "celebrate":
      navigator.vibrate([60, 40, 60, 40, 160]);
      break;
  }
}

export function stopHaptics() {
  if (!transport && phoneCanVibrate) navigator.vibrate(0);
}
