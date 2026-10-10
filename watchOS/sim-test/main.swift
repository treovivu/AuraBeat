// Tests for the watchOS classes, runnable on a Mac without Xcode (WatchKit/CoreMotion are stubbed):
// wave detection replayed on REAL recorded motion (recordings/), the haptic patterns, and the WebSocket
// link against test-server.mjs. Run with ./run.sh from this folder.
import Foundation

func runLoop(for s: TimeInterval) { RunLoop.main.run(until: Date().addingTimeInterval(s)) }
let degToRad = Double.pi / 180

// MARK: Wave detection on real recordings
// Each recording: 5 s of a person doing one thing (Wave Lab, phone held like a watch face, ~60 Hz).
// Columns: t, userAccel x/y/z (g), accel incl. gravity x/y/z (g), rotation alpha/beta/gamma (°/s).
// The watch's roll axis (y, along the forearm) corresponds to the phone's gamma.
struct Recording: Decodable { let trial: String; let samples: [[Double]] }
let shouldWave: Set<String> = ["wave", "gentle"]
let folder = URL(fileURLWithPath: "recordings")
let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil))?
    .filter { $0.pathExtension == "json" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent } ?? []

print("WAVE DETECTION — replaying \(files.count) real recordings")
var correct = 0
for file in files {
    guard let data = try? Data(contentsOf: file), let rec = try? JSONDecoder().decode(Recording.self, from: data) else { continue }
    let detector = MotionDetector(hapticManager: HapticManager())
    var waves = 0
    detector.onWaveDetected = { _ in waves += 1 }
    for s in rec.samples {
        detector.process(roll: s[9] * degToRad, accelMagnitude: (s[1] * s[1] + s[2] * s[2] + s[3] * s[3]).squareRoot(), at: s[0])
    }
    let want = shouldWave.contains(rec.trial)
    let ok = want ? waves > 0 : waves == 0
    if ok { correct += 1 }
    print("  \(ok ? "✅" : "❌") \(file.deletingPathExtension().lastPathComponent.padding(toLength: 10, withPad: " ", startingAt: 0)) waves: \(waves)  (want \(want ? ">0" : "0"))")
}
print("  → \(correct)/\(files.count) correct")

// Our own vibration must never count as a wave.
let buzzing = HapticManager()
let guarded = MotionDetector(hapticManager: buzzing)
var guardedWaves = 0
guarded.onWaveDetected = { _ in guardedWaves += 1 }
buzzing.playPattern("drop")
for i in 0..<50 { guarded.process(roll: (i / 6 % 2 == 0 ? 4 : -4), accelMagnitude: 0.2, at: Double(i) / 50) }
print("  \(guardedWaves == 0 ? "✅" : "❌") strong wave while the watch vibrates → waves: \(guardedWaves)  (want 0)")
runLoop(for: 0.7)

print("HAPTICS")
let haptics = HapticManager()
let patterns: [(String, Double)] = [("beat", 0.6), ("beat", 0.9), ("beat", 0.1), ("percussion", 1), ("bass", 1), ("build", 1), ("chorus", 1), ("drop", 1), ("get-ready", 1), ("wave", 1), ("celebrate", 1)]
for (p, s) in patterns {
    WKInterfaceDevice.shared.played = []
        haptics.playPattern(p, strength: s)
        let played = WKInterfaceDevice.shared.played.first?.rawValue ?? "(nothing)"
    runLoop(for: 0.7)
    print("  \(p) \(s == 1 ? "" : "s=\(s) ")→ \(played)")
}
haptics.playPattern("drop")
let before = haptics.isVibrating
haptics.playPattern("stop")
print("  stop during a buzz → isVibrating \(before) → \(haptics.isVibrating)  (want false right away)")

print("WEBSOCKET")
let client = WatchWebSocketClient()
var received: [String] = []
client.onHapticReceived = { p, s in received.append("\(p)(\(s))") }
client.connect(serverURL: URL(string: "ws://127.0.0.1:\(CommandLine.arguments[1])")!)
print("  isConnected right after connect(): \(client.isConnected)  (want false until the socket opens)")
runLoop(for: 0.5)
print("  isConnected 0.5 s later: \(client.isConnected)")
client.sendWaveEvent(timestamp: Date().timeIntervalSince1970)
runLoop(for: 1.6)
print("  received: \(received)")
runLoop(for: 3.0)
print("  after the server dropped the link, 3 s later isConnected: \(client.isConnected)  (want true = reconnected)")
let offline = WatchWebSocketClient()
offline.connect(serverURL: URL(string: "ws://127.0.0.1:9")!)
print("  no server running → isConnected right away: \(offline.isConnected) (want false)")
runLoop(for: 1.0)
client.disconnect(); offline.disconnect()
