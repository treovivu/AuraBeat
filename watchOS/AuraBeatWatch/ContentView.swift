import SwiftUI

/// The watch face: connection status, a disc that lights up with each cue from the concert,
/// how many waves were sent, and Start / Stop.
struct ContentView: View {
    @EnvironmentObject private var session: WatchSession
    @ObservedObject private var client: WatchWebSocketClient
    @State private var flash = 0.0

    init(client: WatchWebSocketClient) {
        self.client = client
    }

    private static let mint = Color(red: 0.49, green: 0.97, blue: 0.83)
    private static let amber = Color(red: 1.0, green: 0.78, blue: 0.43)
    private static let gold = Color(red: 1.0, green: 0.84, blue: 0.55)

    private var cue: (label: String, color: Color) {
        switch session.lastCue {
        case "beat", "percussion": return ("BEAT", Self.mint)
        // Live Concert names.
        case "bass": return ("BASS", Self.mint)
        case "build": return ("BUILD", Self.amber)
        case "chorus": return ("CHORUS", Self.mint)
        case "drop": return ("DROP", Self.gold)
        // At-home prompts.
        case "get-ready": return ("GET READY", Self.amber)
        case "wave": return ("WAVE", Self.mint)
        case "celebrate": return ("YAY!", Self.gold)
        default: return (session.running ? "Ready" : "AuraBeat", .white)
        }
    }

    /// Live Concert since its last live-only cue (bass/build/chorus/drop); an At-home prompt turns it off.
    @State private var live = false
    private static let liveCues: Set<String> = ["bass", "build", "chorus", "drop"]
    private static let atHomeCues: Set<String> = ["get-ready", "wave", "celebrate"]

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                Circle()
                    .fill(client.isConnected ? Self.mint : Self.amber)
                    .frame(width: 6, height: 6)
                Text(client.isConnected ? "Connected" : session.running ? "Connecting…" : "Not started")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            ZStack {
                Circle()
                    .fill(cue.color.opacity(0.15 + 0.6 * flash))
                    .overlay(Circle().stroke(cue.color.opacity(0.6), lineWidth: 2))
                VStack(spacing: 2) {
                    if live {
                        Text("LIVE · Feel the music")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(cue.label)
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .minimumScaleFactor(0.6)
                    Text("Waves: \(session.wavesSent)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button(session.running ? "Stop" : "Start") {
                session.running ? session.stop() : session.start()
            }
            .tint(session.running ? .red : Self.mint)
        }
        .padding(.horizontal, 4)
        .onChange(of: session.cueCount) { _, _ in
            if let last = session.lastCue {
                if Self.liveCues.contains(last) { live = true }
                if Self.atHomeCues.contains(last) { live = false }
            }
            flash = 1
            withAnimation(.easeOut(duration: 0.45)) { flash = 0 }
        }
    }
}
