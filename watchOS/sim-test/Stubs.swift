// Stand-ins for Apple Watch-only APIs so the watch code runs on a Mac (shapes mirror the real APIs).
import Foundation

enum WKHapticType: String { case notification, directionUp, directionDown, success, failure, retry, start, stop, click }
final class WKInterfaceDevice {
    static let shared = WKInterfaceDevice()
    static func current() -> WKInterfaceDevice { shared }
    var played: [WKHapticType] = []
    func play(_ type: WKHapticType) { played.append(type) }
}

struct CMAcceleration { var x: Double; var y: Double; var z: Double }
struct CMRotationRate { var x = 0.0; var y = 0.0; var z = 0.0 }
final class CMAccelerometerData { let acceleration: CMAcceleration; init(_ a: CMAcceleration) { acceleration = a } }
final class CMDeviceMotion {
    let userAcceleration: CMAcceleration
    let gravity = CMAcceleration(x: 0, y: 0, z: -1)
    let rotationRate = CMRotationRate()
    init(_ user: CMAcceleration) { userAcceleration = user }
}

final class CMMotionManager {
    nonisolated(unsafe) static weak var lastCreated: CMMotionManager?
    init() { CMMotionManager.lastCreated = self }
    var isAccelerometerAvailable = true
    var isDeviceMotionAvailable = true
    var accelerometerUpdateInterval: TimeInterval = 0.1
    var deviceMotionUpdateInterval: TimeInterval = 0.1
    private var accel: ((CMAccelerometerData?, Error?) -> Void)?
    private var motion: ((CMDeviceMotion?, Error?) -> Void)?
    func startAccelerometerUpdates(to queue: OperationQueue, withHandler h: @escaping (CMAccelerometerData?, Error?) -> Void) { accel = h }
    func stopAccelerometerUpdates() { accel = nil }
    func startDeviceMotionUpdates(to queue: OperationQueue, withHandler h: @escaping (CMDeviceMotion?, Error?) -> Void) { motion = h }
    func stopDeviceMotionUpdates() { motion = nil }
    /// Test hook: one sample of user motion (gravity-free). Raw accelerometer readers also get gravity.
    func feed(user u: CMAcceleration) {
        accel?(CMAccelerometerData(CMAcceleration(x: u.x, y: u.y, z: u.z - 1)), nil)
        motion?(CMDeviceMotion(u), nil)
    }
}
