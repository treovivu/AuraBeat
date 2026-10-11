import CoreMotion
import SwiftUI
import WatchKit

// TEMPORARY DIAGNOSTIC — remove once the physical-watch haptic and relay link are confirmed.
// TEST HAPTIC: 100% local, plays a built-in watchOS haptic directly.
// TEST HTTP / TEST WS: one-off network probes to the Mac relay (same host as RelayConfig), showing the
// exact result on screen, to tell "can't reach the Mac" apart from "watchOS blocks the WebSocket".
// RECORD WAVE: 5 s of raw wrist motion, uploaded to the Mac's lab-data/ (same endpoint as Wave Lab), so
// wave detection can be checked on real on-wrist data.
struct HapticTestView: View {
    @StateObject private var recorder = MotionRecorder()
    @State private var taps = 0
    @State private var status = "Ready"
    @State private var probe: URLSessionWebSocketTask?

    private var httpURL: URL {
        var c = URLComponents(url: RelayConfig.url, resolvingAgainstBaseURL: false)!
        c.scheme = "http"
        c.path = "/"
        c.query = nil
        return c.url!
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("AuraBeat Watch")
                    .font(.headline)

                Button(recorder.recording ? "RECORDING…" : "RECORD WAVE") {
                    recorder.record(trial: "watch-wave") { status = $0 }
                }
                .tint(.blue)
                .disabled(recorder.recording)

                Button("TEST HAPTIC") {
                    WKInterfaceDevice.current().play(.notification)
                    taps += 1
                    status = "Played .notification ×\(taps)"
                }
                .tint(.orange)

                Button("TEST HTTP") { testHTTP() }
                Button("TEST WS") { testWebSocket() }

                Text("Status:")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(status)
                    .font(.caption)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 4)
        }
    }

    private func testHTTP() {
        status = "HTTP: trying…"
        var request = URLRequest(url: httpURL)
        request.timeoutInterval = 8
        URLSession.shared.dataTask(with: request) { _, response, error in
            let text: String
            if let error = error as NSError? {
                text = "HTTP FAIL \(error.code): \(error.localizedDescription)"
            } else {
                text = "HTTP OK \((response as? HTTPURLResponse)?.statusCode ?? 0)"
            }
            DispatchQueue.main.async { status = text }
        }.resume()
    }

    private func testWebSocket() {
        status = "WS: trying…"
        probe?.cancel()
        var ws = URLComponents(url: RelayConfig.url, resolvingAgainstBaseURL: false)!
        ws.scheme = "ws"
        ws.path = "/__aurabeat/relay"
        ws.query = "role=watch"
        let task = URLSession.shared.webSocketTask(with: ws.url!)
        probe = task
        task.resume()
        // The relay greets every client with a relay-status message.
        task.receive { result in
            let text: String
            switch result {
            case .success(.string(let message)): text = "WS OK: \(message.prefix(60))"
            case .success: text = "WS OK (data)"
            case .failure(let error as NSError): text = "WS FAIL \(error.code): \(error.localizedDescription)"
            }
            task.cancel(with: .goingAway, reason: nil)
            DispatchQueue.main.async { status = text }
        }
    }
}

/// TEMPORARY DIAGNOSTIC: records 5 s of device motion and posts it to /__aurabeat/lab-recording.
/// Columns: t (s), user accel x/y/z (g), accel incl. gravity x/y/z (g), rotation rate x/y/z (°/s).
final class MotionRecorder: ObservableObject {
    @Published private(set) var recording = false
    private let manager = CMMotionManager()
    private var samples: [[Double]] = []

    func record(trial: String, seconds: Double = 5, status: @escaping (String) -> Void) {
        guard !recording else { return }
        guard manager.isDeviceMotionAvailable else { return status("No motion sensor") }
        recording = true
        samples = []
        status("Wave now! (5 s)")
        WKInterfaceDevice.current().play(.start)
        manager.deviceMotionUpdateInterval = 1.0 / 50.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self = self, let m = motion else { return }
            let deg = 180 / Double.pi
            let u = m.userAcceleration, g = m.gravity, r = m.rotationRate
            self.samples.append([
                (m.timestamp * 10_000).rounded() / 10_000,
                u.x, u.y, u.z, u.x + g.x, u.y + g.y, u.z + g.z,
                r.x * deg, r.y * deg, r.z * deg,
            ])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self else { return }
            self.manager.stopDeviceMotionUpdates()
            WKInterfaceDevice.current().play(.stop)
            status("Uploading \(self.samples.count) samples…")
            self.upload(trial: trial, status: status)
        }
    }

    private func upload(trial: String, status: @escaping (String) -> Void) {
        var c = URLComponents(url: RelayConfig.url, resolvingAgainstBaseURL: false)!
        c.path = "/__aurabeat/lab-recording"
        c.query = nil
        let body: [String: Any] = [
            "trial": trial,
            "source": "apple-watch",
            "columns": ["t", "ax", "ay", "az", "gx", "gy", "gz", "rotX", "rotY", "rotZ"],
            "samples": samples,
        ]
        var request = URLRequest(url: c.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 15
        let count = samples.count
        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            let ok = error == nil && (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                self?.recording = false
                status(ok ? "Sent \(count) samples ✓" : "Upload failed: \(error?.localizedDescription ?? "HTTP error")")
            }
        }.resume()
    }
}
