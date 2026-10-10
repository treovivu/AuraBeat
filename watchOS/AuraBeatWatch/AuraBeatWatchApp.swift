import SwiftUI

@main
struct AuraBeatWatchApp: App {
    @StateObject private var session = WatchSession()

    var body: some Scene {
        WindowGroup {
            ContentView(client: session.client)
                .environmentObject(session)
        }
    }
}
