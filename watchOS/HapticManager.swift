import WatchKit
import Foundation

class HapticManager: ObservableObject {
    @Published var hapticsEnabled: Bool = true
    @Published var isVibrating: Bool = false
    private var stopWorkItem: DispatchWorkItem?

    func stop() {
        stopWorkItem?.cancel()
        isVibrating = false
    }

    func playPattern(_ patternType: String) {
        guard hapticsEnabled else { return }
        let device = WKInterfaceDevice.current()
        var hapticType: WKHapticType?
        var duration: Double = 0.2

        switch patternType.lowercased() {
        case "percussion":
            hapticType = .click
            duration = 0.1
        case "bass":
            hapticType = .directionUp
            duration = 0.25
        case "build":
            hapticType = .start
            duration = 0.4
        case "chorus":
            hapticType = .notification
            duration = 0.5
        case "drop":
            hapticType = .failure
            duration = 0.6
        default:
            hapticType = nil
        }

        if let haptic = hapticType {
            isVibrating = true
            device.play(haptic)
            stopWorkItem?.cancel()
            let item = DispatchWorkItem { [weak self] in
                self?.isVibrating = false
            }
            stopWorkItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: item)
        }
    }
}