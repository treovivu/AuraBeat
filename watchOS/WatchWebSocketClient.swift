import Combine
import Foundation

/// The watch's link to the AuraBeat server.
///
/// - `isConnected` is true only while the socket is actually open.
/// - Reconnects automatically (1 s, 2 s, 4 s … up to 10 s) until `disconnect()` is called.
/// - Understands haptic messages in these shapes:
///     { "type": "haptic", "pattern": "bass", "strength": 0.8 }   (team format)
///     { "pattern": "bass" }                                        (original format)
///     { "type": "cue", "cue": "bass", "strength": 0.8 }          (web Live Concert format)
///     { "type": "stop" }
/// - Sends waves as { "type": "movement_detected", "source": "watch", "timestamp": <epoch ms> }.
/// - An http(s) URL uses the relay's HTTP long-polling instead (same messages): a physical watch can't
///   open WebSockets, because watchOS blocks low-level networking for apps that aren't streaming audio.
///   `<url>/poll?id=…` returns a JSON array of messages, `<url>/send` takes a wave.
class WatchWebSocketClient: NSObject, ObservableObject, URLSessionWebSocketDelegate {
    @Published var isConnected = false
    /// Called on the main queue with (pattern, strength 0–1).
    var onHapticReceived: ((String, Double) -> Void)?

    private var session: URLSession?
    private var webSocketTask: URLSessionWebSocketTask?
    private var serverURL: URL?
    private var shouldReconnect = false
    private var retryDelay: TimeInterval = 1
    // HTTP long-polling
    private let pollID = UUID().uuidString
    private var pollGeneration = 0
    private var usesHTTP: Bool { ["http", "https"].contains(serverURL?.scheme?.lowercased() ?? "") }

    func connect(serverURL: URL) {
        self.serverURL = serverURL
        shouldReconnect = true
        retryDelay = 1
        open()
    }

    func disconnect() {
        shouldReconnect = false
        pollGeneration += 1
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
    }

    private func open() {
        guard let url = serverURL else { return }
        if session == nil {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 30 // longer than the relay's 20 s poll hold
            session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        }
        if usesHTTP {
            pollGeneration += 1
            poll(generation: pollGeneration)
            return
        }
        let task = session!.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        receive(on: task)
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        let delay = retryDelay
        retryDelay = min(retryDelay * 2, 10)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, self.shouldReconnect, self.usesHTTP || !self.isConnected else { return }
            self.open()
        }
    }

    // MARK: URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        guard webSocketTask === self.webSocketTask else { return }
        isConnected = true
        retryDelay = 1
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        guard webSocketTask === self.webSocketTask else { return }
        isConnected = false
        scheduleReconnect()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard task === self.webSocketTask, error != nil else { return }
        isConnected = false
        scheduleReconnect()
    }

    // MARK: Messages

    private func receive(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self = self, task === self.webSocketTask else { return }
            if case .success(let message) = result {
                if case .string(let text) = message, let haptic = Self.parse(text) {
                    DispatchQueue.main.async { self.onHapticReceived?(haptic.pattern, haptic.strength) }
                }
                self.receive(on: task)
            }
            // Failures are handled by the delegate (close / complete), which reconnects.
        }
    }

    // MARK: HTTP long-polling

    private func poll(generation: Int) {
        guard let base = serverURL, let session = session,
              var components = URLComponents(url: base.appendingPathComponent("poll"), resolvingAgainstBaseURL: false)
        else { return }
        components.queryItems = [URLQueryItem(name: "id", value: pollID)]
        guard let url = components.url else { return }
        session.dataTask(with: url) { [weak self] data, response, error in
            guard let self = self, generation == self.pollGeneration, self.shouldReconnect else { return }
            guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data = data,
                  let messages = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                self.isConnected = false
                self.scheduleReconnect()
                return
            }
            self.isConnected = true
            self.retryDelay = 1
            for json in messages {
                if let haptic = Self.parse(json: json) { self.onHapticReceived?(haptic.pattern, haptic.strength) }
            }
            self.poll(generation: generation)
        }.resume()
    }

    static func parse(_ text: String) -> (pattern: String, strength: Double)? {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return parse(json: json)
    }

    static func parse(json: [String: Any]) -> (pattern: String, strength: Double)? {
        let strength = (json["strength"] as? Double).map { min(1, max(0, $0)) } ?? 1.0
        switch json["type"] as? String {
        case "stop":
            return ("stop", 1.0)
        case "cue":
            guard let cue = json["cue"] as? String else { return nil }
            return (cue, strength)
        default:
            guard let pattern = json["pattern"] as? String else { return nil }
            return (pattern, strength)
        }
    }

    func sendWaveEvent(timestamp: TimeInterval = Date().timeIntervalSince1970) {
        let payload: [String: Any] = [
            "type": "movement_detected",
            "source": "watch",
            // Int64: on a real watch (arm64_32) Int is 32-bit and epoch ms overflows it, which crashes.
            "timestamp": Int64(timestamp * 1000),
        ]
        if usesHTTP, let base = serverURL, let session = session,
           let body = try? JSONSerialization.data(withJSONObject: payload) {
            var request = URLRequest(url: base.appendingPathComponent("send"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
            session.dataTask(with: request).resume()
            return
        }
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let jsonString = String(data: data, encoding: .utf8) {
            webSocketTask?.send(.string(jsonString)) { _ in }
        }
    }
}
