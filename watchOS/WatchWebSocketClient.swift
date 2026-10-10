import Foundation

class WatchWebSocketClient: ObservableObject {
    private var webSocketTask: URLSessionWebSocketTask?
    @Published var isConnected = false
    var onHapticReceived: ((String) -> Void)?

    func connect(serverURL: URL) {
        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: serverURL)
        webSocketTask?.resume()
        isConnected = true
        receiveMessages()
    }

    private func receiveMessages() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let pattern = json["pattern"] as? String {
                    DispatchQueue.main.async {
                        self?.onHapticReceived?(pattern)
                    }
                }
                self?.receiveMessages()
            case .failure:
                DispatchQueue.main.async {
                    self?.isConnected = false
                }
            }
        }
    }

    func sendWaveEvent(timestamp: TimeInterval) {
        let payload: [String: Any] = [
            "event": "wrist_wave",
            "timestamp": timestamp
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let jsonString = String(data: data, encoding: .utf8) {
            webSocketTask?.send(.string(jsonString)) { _ in }
        }
    }
}