import CoreMotion
import Foundation

/// Detects a "wave with the music": the hand swinging side to side, not walking, bouncing or clapping.
///
/// Uses `CMDeviceMotion.userAcceleration` (gravity already removed) on the watch's x axis, which runs
/// across the wrist. A wave is counted after `swingsForWave` alternating swings (left-right-left…)
/// inside `waveWindow`. Each swing must stay above `swingThreshold` for `minSwingSamples` samples,
/// so short spikes like claps are ignored. Movement while the watch is vibrating is ignored.
///
/// Thresholds are starting points from simulation — tune them on a real wrist.
class MotionDetector: ObservableObject {
    private let motionManager = CMMotionManager()
    private let hapticManager: HapticManager

    /// Lateral acceleration (g, gravity removed) a swing must exceed.
    var swingThreshold = 0.5
    /// Consecutive samples above the threshold for a swing to count (at 50 Hz, 3 ≈ 60 ms).
    var minSwingSamples = 3
    /// Alternating swings needed for one wave.
    var swingsForWave = 3
    /// All swings of one wave must happen within this time.
    var waveWindow: TimeInterval = 1.2
    /// Pause after a detected wave before the next can be reported.
    var waveCooldown: TimeInterval = 0.6

    var onWaveDetected: ((TimeInterval) -> Void)?

    private var aboveCount = 0
    private var currentSign = 0
    private var swingTimes: [TimeInterval] = []
    private var lastSwingSign = 0
    private var lastWaveTime: TimeInterval = 0

    init(hapticManager: HapticManager) {
        self.hapticManager = hapticManager
    }

    func start() {
        guard motionManager.isDeviceMotionAvailable else { return }
        motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion, error == nil else { return }
            self.process(lateral: motion.userAcceleration.x, at: ProcessInfo.processInfo.systemUptime)
        }
    }

    func stop() {
        motionManager.stopDeviceMotionUpdates()
        reset()
    }

    private func reset() {
        aboveCount = 0
        currentSign = 0
        swingTimes.removeAll()
        lastSwingSign = 0
    }

    private func process(lateral: Double, at now: TimeInterval) {
        // Ignore movement caused by our own vibration.
        if hapticManager.isVibrating {
            reset()
            return
        }

        let sign = lateral > swingThreshold ? 1 : lateral < -swingThreshold ? -1 : 0
        if sign != 0 && sign == currentSign {
            aboveCount += 1
        } else {
            currentSign = sign
            aboveCount = sign == 0 ? 0 : 1
        }

        // A swing is a sustained push in one direction, opposite to the previous swing.
        guard aboveCount == minSwingSamples, sign != lastSwingSign else { return }
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
