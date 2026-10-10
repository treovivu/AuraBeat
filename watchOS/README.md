# AuraBeat — Apple Watch

Based on Pramit's `PramitWatchPre` classes, with fixes found by simulated testing.

| File | Role |
|---|---|
| `MotionDetector.swift` | Detects a wrist wave |
| `HapticManager.swift` | Plays haptic patterns |
| `WatchWebSocketClient.swift` | Link to the AuraBeat server |
| `sim-test/` | Simulated tests that run on a Mac without Xcode (`./sim-test/run.sh`) |

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

- **Wave detection** uses `CMDeviceMotion.userAcceleration` (gravity removed) across the wrist (x axis). A wave = 3 alternating side-to-side swings within 1.2 s; each swing must last ≥ 60 ms (ignores claps); 0.6 s cooldown; movement during our own vibration is still ignored.
  - Before: `|raw acceleration| − 1 > 0.45 g` caught bouncing and clapping, and missed normal sideways waves.
- **Haptics**: added `beat`, `get-ready`, `wave`, `celebrate`, `stop`; uses `strength`; `drop` uses `success` instead of `failure`.
- **WebSocket**: `isConnected` is true only once the socket actually opens; automatic reconnect (1 s → 10 s backoff); parses all message forms above; sends `movement_detected`.

## Simulated results (`./sim-test/run.sh`)

| Scenario | Before | After |
|---|---|---|
| Resting, walking, single arm raise | no wave ✅ | no wave ✅ |
| Brisk walking / bouncing | 6 false waves ❌ | none ✅ |
| Clapping | 7 false waves ❌ | none ✅ |
| Gentle / normal side-to-side wave | missed ❌ | detected ✅ |
| Strong wave | detected ✅ | detected ✅ |
| Wave while vibrating | ignored ✅ | ignored ✅ |

## Still to do on a real watch

1. **Build in Xcode.** These files were tested on a Mac with stand-ins for WatchKit/CoreMotion; they still need a real watchOS build.
2. **A watchOS app target**: `@main` app, a simple screen, and wiring: `WatchWebSocketClient.onHapticReceived → HapticManager.playPattern(_:strength:)`, `MotionDetector.onWaveDetected → WatchWebSocketClient.sendWaveEvent()`.
3. **Stay awake during a show**: start an `HKWorkoutSession` or `WKExtendedRuntimeSession` so motion and haptics keep working with the wrist down.
4. **Tune on-wrist**: `swingThreshold` (0.5 g), `swingsForWave` (3), `waveWindow` (1.2 s) are starting points from simulation.
5. **Relay server** between the web app and the watch (not built yet).
