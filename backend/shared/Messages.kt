// Shared message types for the Wear OS watch app. Mirrors backend/app/messages.py.
// Needs: kotlinx-serialization-json, and OkHttp for the WebSocket.
// Connect (hotspot):  ws://<laptop-LAN-IP>:8001/ws?role=watch&session=demo
// Connect (deployed): wss://<DOMAIN>/ws?role=watch&session=demo
// Optional &pair=<phone-id> ties this watch to one phone's At-home attempt (the phone id is shown by
// GET /clients). Without it, waves go to the most recently active At-home phone in the session.
// (the watch can't reach "localhost" on your laptop; use its LAN IP or the deployed URL)

package com.team.haptics.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

val wireJson = Json { ignoreUnknownKeys = true; explicitNulls = false }

/** Every incoming message. Decode this first, then decode `payload` by `type`. */
@Serializable
data class Envelope(
    val v: Int = 1,
    val type: String,
    val id: String = "",
    val session: String = "demo",
    @SerialName("sent_at") val sentAt: Long = 0,
    val payload: JsonObject,
)

@Serializable
data class CuePayload(
    @SerialName("cue_id") val cueId: String,
    val kind: String,            // beat | bass | percussion | drop | build | chorus | lyric | get_ready | wave
    @SerialName("at_ms") val atMs: Long = 0,
    val intensity: Double = 0.8, // 0..1 -> vibration amplitude (1..255)
    @SerialName("duration_ms") val durationMs: Long = 120,
    val pattern: String = "tap", // tap | double_tap | pulse | long | ramp | none
    val color: String? = null,
    val text: String? = null,
)

@Serializable data class ControlPayload(val action: String) // stop | haptics_on | haptics_off | reset

@Serializable
data class PlaybackPayload(
    val state: String, // playing | paused | stopped
    @SerialName("position_ms") val positionMs: Long,
    @SerialName("media_id") val mediaId: String? = null,
)

@Serializable
data class PongPayload(
    @SerialName("client_time") val clientTime: Long,
    @SerialName("server_time") val serverTime: Long,
)

// ---- outgoing (watch -> server) ----

@Serializable data class Outgoing<P>(val type: String, val payload: P)

@Serializable
data class PingOut(
    @SerialName("client_time") val clientTime: Long,
    @SerialName("last_rtt_ms") val lastRttMs: Double? = null,
    @SerialName("clock_offset_ms") val clockOffsetMs: Double? = null,
)

@Serializable
data class AckOut(
    @SerialName("cue_id") val cueId: String,
    @SerialName("received_at") val receivedAt: Long,
)

@Serializable
data class MovementOut(
    val gesture: String = "wave",
    val confidence: Double = 1.0,          // below 0.5 never scores
    @SerialName("at_ms") val atMs: Long? = null,
    // REQUIRED for fair scoring: System.currentTimeMillis() at the moment the wave was detected
    // (not when you send it). The backend maps it to the video clock using your ping offset.
    @SerialName("client_time") val clientTime: Long? = null,
)

/** Server -> watch: a staff announcement. Buzz a distinct pattern (urgent = stronger) and show the text. */
@Serializable
data class AnnouncementPayload(
    val id: String,
    val text: String,
    val urgent: Boolean = false,
)

// Usage in OkHttp WebSocketListener.onMessage:
//   val env = wireJson.decodeFromString<Envelope>(text)
//   when (env.type) {
//     "cue" -> { val c = wireJson.decodeFromJsonElement<CuePayload>(env.payload); vibrate(c)
//                ws.send(wireJson.encodeToString(Outgoing("ack", AckOut(c.cueId, System.currentTimeMillis())))) }
//     "control" -> handleControl(wireJson.decodeFromJsonElement<ControlPayload>(env.payload))
//     "announcement" -> { val a = wireJson.decodeFromJsonElement<AnnouncementPayload>(env.payload); showAndBuzz(a) }
//     "pong" -> { /* rtt = now - clientTime; offset = serverTime - (clientTime + rtt/2); send both in the next ping */ }
//     else -> {} // welcome, status, presence: safe to ignore
//   }
// Ping every 2 s so the backend knows this watch's clock offset (needed for scoring):
//   ws.send(wireJson.encodeToString(Outgoing("ping", PingOut(System.currentTimeMillis(), lastRtt, offset))))
// On wave detected:
//   val t = System.currentTimeMillis()   // read the time FIRST
//   ws.send(wireJson.encodeToString(Outgoing("movement", MovementOut(confidence = 0.9, clientTime = t))))
//
// Fairness notes:
// - The backend already holds back haptic cues within ±350 ms of a target beat, so the motor can't
//   fake a wave at a scoring moment. Still ignore motion for ~250 ms after any vibration you play.
// - One wave = one movement message. The backend also enforces a 700 ms cooldown.
