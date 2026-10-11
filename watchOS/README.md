# AuraBeat — Apple Watch

Based on Pramit's `PramitWatchPre` classes, with fixes found by testing — wave detection tuned on real recorded motion.

| File | Role |
|---|---|
| `MotionDetector.swift` | Detects a wrist wave |
| `HapticManager.swift` | Plays haptic patterns |
| `WatchWebSocketClient.swift` | Link to the AuraBeat server |
| `sim-test/` | Tests that run on a Mac without Xcode (`./sim-test/run.sh`): real-motion replay, haptics, WebSocket |

## Message protocol (JSON over WebSocket)

**Server → watch (haptics)**
```json
{ "type": "haptic", "pattern": "bass", "strength": 0.8 }
{ "type": "stop" }
```
Also accepted: `{ "pattern": "bass" }` and the web Live Concert form `{ "type": "cue", "cue": "bass", "strength": 0.8 }`.

| Pattern | Used by | Watch haptic |
|---|---|---|
| `beat` (alias `percussion`) | Live + At-home | `click`, or `directionUp` when strength ≥ 0.8; skipped below 0.25 |
| `bass` | Live | `directionUp` |
| `build`, `get-ready` | Live / At-home | `start` |
| `chorus`, `wave` | Live / At-home | `notification` |
| `drop`, `celebrate` | Live / At-home | `success` |
| `stop` | both | cancels immediately |

**Watch → server (wave)**
```json
{ "type": "movement_detected", "source": "watch", "timestamp": 1791636354360 }
```
`timestamp` is epoch milliseconds. The web app decides whether a wave counts (it checks the song time when the event arrives).

## What changed from `PramitWatchPre`

- **Wave detection — tuned on real motion.** Recordings made with Wave Lab (a phone held like a watch face)
  showed that people wave mostly by **rolling the wrist**, not by pushing sideways. The detector now counts
  a *swing* when the roll rate (`rotationRate.y`, along the forearm) stays above **1.75 rad/s (100 °/s)**
  for **60 ms**, and a *wave* after **2 alternating swings within 1.4 s** (0.6 s cooldown). While the
  whole body bounces hard (gravity-free acceleration RMS over 0.5 s > **1.0 g**, raised from 0.8 after on-wrist recordings) nothing counts, and
  movement during our own vibration is still ignored. Timing comes from each sample's `timestamp`, so it
  works at any sensor rate.
- **Haptics**: added `beat`, `get-ready`, `wave`, `celebrate`, `stop`; uses `strength`; `drop` uses `success` instead of `failure`.
- **WebSocket**: `isConnected` is true only once the socket actually opens; automatic reconnect (1 s → 10 s backoff); parses all message forms above; sends `movement_detected`.

## Results on 24 real recordings (`./sim-test/run.sh`)

| Recorded motion | Trials | Original (`PramitWatchPre`) | Now |
|---|---|---|---|
| Waving | 7 | detected ✅ | detected ✅ |
| Gentle waving | 4 | detected ✅ | detected ✅ |
| Walking | 3 | false waves in 3/3 ❌ | none ✅ |
| Bouncing to the beat | 2 | 10–11 false waves ❌ | none ✅ |
| Clapping | 4 | 2–12 false waves ❌ | none ✅ |
| Single arm raise | 3 | false waves in 2/3 ❌ | none ✅ |
| Resting | 1 | none ✅ | none ✅ |

The recordings are in `sim-test/recordings/` (5 s each, ~60 Hz, iPhone; columns listed in each file).
Wave Lab (`wave-lab.html`, run with `npm run dev:lab`) uses the same algorithm in JavaScript to record more.

## Still to do on a real watch

1. **Build in Xcode.** These files were tested on a Mac with stand-ins for WatchKit/CoreMotion; they still need a real watchOS build.
2. **A watchOS app target**: `@main` app, a simple screen, and wiring: `WatchWebSocketClient.onHapticReceived → HapticManager.playPattern(_:strength:)`, `MotionDetector.onWaveDetected → WatchWebSocketClient.sendWaveEvent()`.
3. **Stay awake during a show**: start an `HKWorkoutSession` or `WKExtendedRuntimeSession` so motion and haptics keep working with the wrist down.
4. **Check on-wrist**: the settings were tuned on a hand-held phone. On the watch, confirm `rotationRate.y` is the forearm-roll axis for both wrist orientations and adjust `rotationThreshold` / `bounceGate` if needed.
5. **Relay server** between the web app and the watch (not built yet).
