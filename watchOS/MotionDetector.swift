import CoreMotion
import Foundation

class MotionDetector: ObservableObject {
    private let motionManager = CMMotionManager()
    private let hapticManager: HapticManager
    private var lastWaveTime: TimeInterval = 0
    private let waveCooldown: TimeInterval = 0.4
    
    var onWaveDetected: ((TimeInterval) -> Void)?

    init(hapticManager: HapticManager) {
        self.hapticManager = hapticManager
    }

    func start() {
        guard motionManager.isAccelerometerAvailable else { return }
        motionManager.accelerometerUpdateInterval = 1.0 / 50.0
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            
            // GUARD: Ignore movement generated while vibration motor is active
            if self.hapticManager.isVibrating { return }
            
            let x = data.acceleration.x
            let y = data.acceleration.y
            let z = data.acceleration.z
            let magnitude = sqrt(x * x + y * y + z * z) - 1.0
            let currentTime = ProcessInfo.processInfo.systemUptime
            
            if magnitude > 0.45 && (currentTime - self.lastWaveTime) > self.waveCooldown {
                self.lastWaveTime = currentTime
                self.onWaveDetected?(currentTime)
            }
        }
    }

    func stop() {
        motionManager.stopAccelerometerUpdates()
    }
}