import Foundation
import WatchKit

/// Runs the watch side of AuraBeat: connects to the relay, plays the haptic cues it receives, and
/// sends a `movement_detected` when the wearer waves.
///
/// An extended runtime session keeps motion and haptics working while the wrist is lowered
/// (add the "Background Modes → Physical therapy" capability; without it the app still works while
/// the screen is on).
final class WatchSession: NSObject, ObservableObject, WKExtendedRuntimeSessionDelegate {
    @Published private(set) var running = false
    /// Last cue received, and a counter so the face can flash even when the same cue repeats.
    @Published private(set) var lastCue: String?
    @Published private(set) var cueCount = 0
    @Published private(set) var wavesSent = 0

    let client = WatchWebSocketClient()
    private let haptics = HapticManager()
    private lazy var motion = MotionDetector(hapticManager: haptics)
    private var runtime: WKExtendedRuntimeSession?

    override init() {
        super.init()
        client.onHapticReceived = { [weak self] pattern, strength in
            guard let self = self else { return }
            self.haptics.playPattern(pattern, strength: strength)
            self.lastCue = pattern == "stop" ? nil : pattern
            self.cueCount += 1
        }
        motion.onWaveDetected = { [weak self] _ in
            guard let self = self else { return }
            self.client.sendWaveEvent()
            self.wavesSent += 1
        }
    }

    func start() {
        guard !running else { return }
        running = true
        client.connect(serverURL: RelayConfig.url)
        motion.start()
        let session = WKExtendedRuntimeSession()
        session.delegate = self
        session.start()
        runtime = session
    }

    func stop() {
        guard running else { return }
        running = false
        motion.stop()
        haptics.stop()
        client.disconnect()
        runtime?.invalidate()
        runtime = nil
    }

    // MARK: WKExtendedRuntimeSessionDelegate

    func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {}

    func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {}

    func extendedRuntimeSession(
        _ extendedRuntimeSession: WKExtendedRuntimeSession,
        didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
        error: Error?
    ) {
        // Without the background capability the session ends right away; the app keeps working
        // while it is on screen.
        runtime = nil
    }
}
