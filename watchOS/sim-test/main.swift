// Simulated tests for the watchOS classes, runnable on a Mac without Xcode:
// fake wrist motion at 50 Hz, the haptic patterns, and the WebSocket link against test-server.mjs.
// Run with ./run.sh from this folder.
import Foundation


func runLoop(for s: TimeInterval) { RunLoop.main.run(until: Date().addingTimeInterval(s)) }
func n(_ a: Double) -> Double { Double.random(in: -a...a) }
let tau = 2 * Double.pi

func scenario(seconds: Double = 3, prepare: ((HapticManager) -> Void)? = nil, _ motion: @escaping (Double) -> CMAcceleration) -> Int {
    let haptics = HapticManager()
    let detector = MotionDetector(hapticManager: haptics)
    var waves = 0
    detector.onWaveDetected = { _ in waves += 1 }
    detector.start()
    guard let manager = CMMotionManager.lastCreated else { return -1 }
    prepare?(haptics)
    let start = Date()
    let timer = Timer(timeInterval: 1.0 / 50.0, repeats: true) { _ in manager.feed(user: motion(Date().timeIntervalSince(start))) }
    RunLoop.main.add(timer, forMode: .common)
    runLoop(for: seconds)
    timer.invalidate()
    detector.stop()
    return waves
}

// x = across the wrist (side-to-side), y = along the forearm, z = out of the watch face. Gravity-free (g).
let cases: [(String, Bool, () -> Int)] = [
    ("Resting wrist", false, { scenario { _ in CMAcceleration(x: n(0.02), y: n(0.02), z: n(0.02)) } }),
    ("Walking", false, { scenario { t in CMAcceleration(x: n(0.05), y: 0.3 * sin(tau * 1.8 * t), z: 0.25 * sin(tau * 3.6 * t)) } }),
    ("Brisk walking / bouncing", false, { scenario { t in CMAcceleration(x: 0.15 * sin(tau * 2 * t), y: 0.4 * sin(tau * 2 * t), z: -0.5 * abs(sin(tau * 2 * t))) } }),
    ("Clapping (2.5 g spikes)", false, { scenario { t in CMAcceleration(x: t.truncatingRemainder(dividingBy: 0.5) < 0.04 ? 2.5 : n(0.03), y: n(0.03), z: n(0.03)) } }),
    ("Single arm raise (one push)", false, { scenario { t in CMAcceleration(x: t > 0.5 && t < 0.8 ? 0.8 : n(0.03), y: n(0.03), z: n(0.03)) } }),
    ("Gentle wave (0.6 g)", true, { scenario { t in CMAcceleration(x: 0.6 * sin(tau * 2 * t), y: n(0.03), z: n(0.03)) } }),
    ("Normal wave (1.0 g)", true, { scenario { t in CMAcceleration(x: 1.0 * sin(tau * 2 * t), y: n(0.03), z: n(0.03)) } }),
    ("Strong wave (1.6 g)", true, { scenario { t in CMAcceleration(x: 1.6 * sin(tau * 2 * t), y: n(0.05), z: n(0.05)) } }),
    ("Strong wave while vibrating", false, { scenario(seconds: 0.5, prepare: { $0.playPattern("drop") }) { t in CMAcceleration(x: 1.6 * sin(tau * 2 * t), y: 0, z: 0) } }),
]

print("WAVE DETECTION (3 s each)")
for (name, shouldDetect, run) in cases {
    let waves = run()
    let ok = shouldDetect ? waves > 0 : waves == 0
    print("  \(ok ? "✅" : "❌") \(name.padding(toLength: 30, withPad: " ", startingAt: 0)) waves: \(waves)  (want \(shouldDetect ? ">0" : "0"))")
}

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
