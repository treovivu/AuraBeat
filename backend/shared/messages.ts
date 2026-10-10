// Shared message types for the React/TS phone app. Mirrors backend/app/messages.py.
// Connect: new WebSocket(`ws://<host>:8001/ws?role=phone&session=demo&client_id=<stable id>`)

export type Role = "phone" | "watch" | "controller";
export type CueKind = "beat" | "bass" | "percussion" | "drop" | "build" | "chorus" | "lyric" | "get_ready" | "wave";
export type HapticPattern = "tap" | "double_tap" | "pulse" | "long" | "ramp" | "none";
export type ControlAction = "stop" | "haptics_on" | "haptics_off" | "reset";
export type PlaybackState = "playing" | "paused" | "stopped" | "buffering" | "ended";

interface Envelope<T extends string, P> {
  v: number;
  type: T;
  id: string;
  session: string;
  sent_at: number; // server Unix ms
  payload: P;
  seq?: number; // cues only: per-session counter
  display_at?: number; // cues only: server ms when every phone should show it
}

export interface CuePayload {
  cue_id: string;
  kind: CueKind;
  at_ms: number;        // song/video position; 0 for live cues
  intensity: number;    // 0..1
  duration_ms: number;
  pattern: HapticPattern;
  color: string | null; // lightstick hex
  text: string | null;  // lyric line / prompt
}

export type ServerMessage =
  | Envelope<"welcome", { client_id: string; role: Role; session: string; server_time: number; protocol_version: number }>
  | Envelope<"cue", CuePayload>
  | Envelope<"playback", { state: PlaybackState; position_ms: number; media_id: string | null }>
  | Envelope<"control", { action: ControlAction }>
  | Envelope<"movement_detected", { gesture: "wave"; confidence: number; at_ms: number | null; source_client: string }>
  | Envelope<"status", { audio: "listening" | "lost" | "idle"; source: string | null; title: string | null; position_ms: number | null }>
  | Envelope<"presence", { phones: number; watches: number; controllers: number }>
  | Envelope<"attempt", { attempt_id: string; version: number; play_along: boolean; targets: { id: string; t_ms: number }[]; rule_version: string; window_ms: { on_beat: number; close: number } }>
  | Envelope<"score", { attempt_id: string; target_id: string; result: "on_beat" | "close" | "missed"; points: number; offset_ms: number | null; total: number; hits: number; judged: number; targets: number; rule_version: string }>
  | Envelope<"results", { attempt_id: string; total: number; on_beat: number; close: number; missed: number; targets: number; rule_version: string }>
  | Envelope<"announcement", { id: string; text: string; urgent: boolean }>
  | Envelope<"pong", { client_time: number; server_time: number }>
  | Envelope<"error", { message: string }>;

// Clients only need to send type + payload; the server fills the rest.
export type ClientMessage =
  | { type: "ping"; payload: { client_time: number; last_rtt_ms?: number; clock_offset_ms?: number } }
  | { type: "ack"; payload: { cue_id: string; received_at: number } }
  | { type: "movement"; payload: { gesture: "wave"; confidence?: number; at_ms?: number; client_time?: number } }
  // Phones only (At-home): open a private attempt, then report the video clock.
  | { type: "attempt"; payload: { media_id: string; title?: string; play_along: boolean; bpm: number; downbeat_anchor: number; beats_per_bar: number; duration: number; windows: { id: string; start: number; end: number }[] } }
  | { type: "playback"; payload: { state: PlaybackState; position_ms: number; version: number; client_time: number } }
  // Phones only (At-home mode): relayed to the watches in the session.
  | { type: "cue"; payload: Partial<CuePayload> & { kind: CueKind } };

// Usage:
// ws.onmessage = (e) => {
//   const m: ServerMessage = JSON.parse(e.data);
//   switch (m.type) {
//     case "cue": flashLightstick(m.payload); ws.send(JSON.stringify({ type: "ack", payload: { cue_id: m.payload.cue_id, received_at: Date.now() } })); break;
//     case "movement_detected": triggerStageReaction(); break;
//     case "playback": syncVideo(m.payload); break;
//   }
// };
