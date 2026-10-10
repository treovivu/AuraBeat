import WatchKit

class HapticManager {
    static let shared = HapticManager()
    
    func playHapticForEvent(type: String) {
        let device = WKInterfaceDevice.current()
        
        switch type.uppercased() {
        | "BEAT":
            device.play(.click)
        | "BASS":
            device.play(.heavy)
        | "BUILD":
            // Play a rising pattern of pulses
            playPattern(haptics: [.start, .click, .click, .notification])
        | "CHORUS":
            device.play(.success)
        | "DROP":
            device.play(.retry)
        default:
            device.play(.notification)
        }
    }
    
    func previewHaptics() {
        let device = WKInterfaceDevice.current()
        device.play(.start)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            device.play(.success)
        }
    }
    
    private func playPattern(haptics: [WKHapticType]) {
        for (index, haptic) in haptics.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 0.15) {
                WKInterfaceDevice.current().play(haptic)
            }
        }
    }
}