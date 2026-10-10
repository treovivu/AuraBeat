import Foundation
import WatchConnectivity

class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()
    
    @Published var isConnected = false
    @Published var lastEvent: [String: Any]? = nil
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isConnected = (activationState == .activated)
        }
    }
    
    // Receive messages sent from the iOS app
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        DispatchQueue.main.async {
            self.lastEvent = message
            
            // Handle incoming musical event type
            if let eventType = message["type"] as? String {
                HapticManager.shared.playHapticForEvent(type: eventType)
            }
        }
    }
    
    // Send movement score back to iOS app
    func sendMovementData(score: Double) {
        guard WCSession.default.isReachable else { return }
        let data: [String: Any] = ["movementScore": score, "timestamp": Date().timeIntervalSince1970]
        WCSession.default.sendMessage(data, replyHandler: nil) { error in
            print("Error sending movement data: \(error.localizedDescription)")
        }
    }
}