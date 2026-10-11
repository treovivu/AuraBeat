import CoreMotion
import Foundation

/// Detects a "wave with the music".
///
/// Tuned on real recorded motion (Wave Lab): waving is mostly **wrist roll** — the forearm rotating back
/// and forth — not a sideways push. So a swing is a sustained rotation around the device's y axis
/// (along the forearm when worn) faster than `rotationThreshold`, and a wave is `swingsForWave`
/// alternating swings inside `waveWindow`. While the whole body is bouncing hard (gravity-free
/// acceleration RMS over the last 0.5 s above `bounceGate`), nothing counts. Movement caused by our own
/// vibration is ignored.
///
/// Real-motion results (24 recorded trials, phone held like a watch face): waving and gentle waving
/// detected; walking, bouncing, clapping, a single arm raise and resting never counted.
/// Re-check on a real wrist — the watch's axes and strap position can differ from a hand-held phone.
class MotionDetector: ObservableObject {
    private let motionManager = CMMotionManager()
    private let hapticManager: HapticManager

    /// Wrist roll speed a swing must exceed (rad/s). 1.75 rad/s ≈ 100 °/s.
    var rotationThreshold = 1.75
    /// How long a swing must stay above the threshold (s). Time-based, so it works at any sensor rate.
    var minSwingDuration: TimeInterval = 0.06
    /// Alternating swings needed for one wave.
    var swingsForWave = 2
    /// All swings of one wave must happen within this time (s).
    var waveWindow: TimeInterval = 1.4
    /// Pause after a detected wave before the next can be reported (s).
    var waveCooldown: TimeInterval = 0.6
    /// No waves while gravity-free acceleration RMS over the last 0.5 s is above this (g).
    /// 1.0, not the phone-tuned 0.8: a wave on a real wrist measured 0.86–1.05 g, and 1.0 still rejects
    /// every recorded walk, bounce, clap and arm raise.
    var bounceGate = 1.0

    var onWaveDetected: ((TimeInterval) -> Void)?

    private let gateWindow: TimeInterval = 0.5
    private var currentSign = 0
    private var aboveSince: TimeInterval = 0
    private var counted = false
    private var lastSwingSign = 0
    private var swingTimes: [TimeInterval] = []
    private var lastWaveTime: TimeInterval = -.infinity
    private var recentAccel: [(time: TimeInterval, magnitude: Double)] = []

    init(hapticManager: HapticManager) {
        self.hapticManager = hapticManager
    }

    func start() {
        guard motionManager.isDeviceMotionAvailable else { return }
        motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion, error == nil else { return }
            let a = motion.userAcceleration
            self.process(
                roll: motion.rotationRate.y,
                accelMagnitude: (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot(),
                at: motion.timestamp
            )
        }
    }

    func stop() {
        motionManager.stopDeviceMotionUpdates()
        resetSwings()
        recentAccel.removeAll()
    }

    private func resetSwings() {
        currentSign = 0
        counted = false
        lastSwingSign = 0
        swingTimes.removeAll()
    }

    /// One motion sample: roll rate (rad/s), gravity-free acceleration magnitude (g), sensor time (s).
    func process(roll: Double, accelMagnitude: Double, at now: TimeInterval) {
        // Ignore movement caused by our own vibration. Only the swing in progress is dropped: swings
        // already completed still count, or beat haptics every 0.4 s would erase every wave.
        if hapticManager.isVibrating {
            currentSign = 0
            counted = false
            return
        }

        // Whole-body bounce gate.
        recentAccel.append((now, accelMagnitude))
        recentAccel.removeAll { now - $0.time > gateWindow }
        let rms = (recentAccel.reduce(0) { $0 + $1.magnitude * $1.magnitude } / Double(recentAccel.count)).squareRoot()
        if rms > bounceGate {
            resetSwings()
            return
        }

        let sign = roll > rotationThreshold ? 1 : roll < -rotationThreshold ? -1 : 0
        if sign == 0 || sign != currentSign {
            currentSign = sign
            aboveSince = now
            counted = false
            return
        }

        // A swing is a sustained roll in one direction, opposite to the previous swing.
        guard !counted, now - aboveSince >= minSwingDuration, sign != lastSwingSign else { return }
        counted = true
        lastSwingSign = sign
        swingTimes.append(now)
        swingTimes.removeAll { now - $0 > waveWindow }

        if swingTimes.count >= swingsForWave, now - lastWaveTime > waveCooldown {
            lastWaveTime = now
            swingTimes.removeAll()
            onWaveDetected?(now)
        }
    }
}
