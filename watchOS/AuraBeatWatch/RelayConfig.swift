import Foundation

/// Where the watch finds the AuraBeat relay.
///
/// During development the relay runs inside the web app's dev server on the Mac
/// (`npm run dev -- --host`, plain http on port 5173). Put the Mac's address here:
/// IPv6 goes in brackets, e.g. `ws://[2600:…]:5173/…`, IPv4 as `ws://192.168.1.20:5173/…`.
/// Find it with `ipconfig getifaddr en0` (IPv4) or `ifconfig en0 | grep "inet6 2"` (IPv6).
enum RelayConfig {
    static let url = URL(string: "ws://[2600:1700:1c04:a130:898:e93f:e601:3815]:5173/__aurabeat/relay?role=watch")!
}
