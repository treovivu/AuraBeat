import WatchKit
import Foundation

/// Plays AuraBeat haptic patterns on the watch.
///
/// Understands both the Live Concert cues (beat, bass, build, chorus, drop) and the At-home Concert
/// cues (beat, get-ready, wave, celebrate), plus `stop`. `percussion` is accepted as an alias of `beat`.
class HapticManager: ObservableObject {
    @Published var hapticsEnabled: Bool = true
    @Published var isVibrating: Bool = false
    private var stopWorkItem: DispatchWorkItem?

    /// Stops right away: clears the vibrating state so motion detection resumes immediately.
    func stop() {
        stopWorkItem?.cancel()
        stopWorkItem = nil
        isVibrating = false
    }

    /// - Parameters:
    ///   - patternType: the cue name.
    ///   - strength: 0–1 from the server; light beats use a softer haptic, and very light ones are skipped.
    func playPattern(_ patternType: String, strength: Double = 1.0) {
        let pattern = patternType.lowercased()
        if pattern == "stop" {
            stop()
            return
        }
        guard hapticsEnabled else { return }

        let hapticType: WKHapticType
        let duration: Double
        switch pattern {
        case "beat", "percussion":
            if strength < 0.25 { return }
            hapticType = strength >= 0.8 ? .directionUp : .click
            duration = 0.1
        case "bass":
            hapticType = .directionUp
            duration = 0.25
        case "build", "get-ready":
            hapticType = .start
            duration = 0.4
        case "chorus", "wave":
            hapticType = .notification
            duration = 0.5
        case "drop", "celebrate":
            hapticType = .success
            duration = 0.6
        default:
            return
        }

        isVibrating = true
        WKInterfaceDevice.current().play(hapticType)
        stopWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.isVibrating = false
        }
        stopWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: item)
    }
}
