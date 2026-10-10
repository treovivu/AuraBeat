import Foundation
import CoreMotion
import Combine

class MotionManager: ObservableObject {
    private let motionManager = CMMotionManager()
    @Published var isWaving = false
    var onMovementDetected: (() -> Void)?
    
    func startTracking() {
        guard motionManager.isAccelerometerAvailable else { return }
        motionManager.accelerometerUpdateInterval = 0.1
        
        motionManager.startAccelerometerUpdates(to: OperationQueue.main) { [weak self] data, error in
            guard let acceleration = data?.acceleration else { return }
            
            // Detect sharp acceleration changes indicating a wrist wave
            let totalAcceleration = abs(acceleration.x) + abs(acceleration.y) + abs(acceleration.z)
            if totalAcceleration > 2.5 {
                self?.isWaving = true
                self?.onMovementDetected?()
                
                // Reset waving state after a short delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.isWaving = false
                }
            }
        }
    }
    
    func stopTracking() {
        motionManager.stopAccelerometerUpdates()
    }
}