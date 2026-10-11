import SwiftUI

@main
struct AuraBeatWatchApp: App {
    @StateObject private var session = WatchSession()

    var body: some Scene {
        WindowGroup {
            // TEMPORARY DIAGNOSTIC: page 1 is the local haptic test; swipe for the normal AuraBeat screen.
            // Restore to just ContentView once the physical-watch haptic is confirmed.
            TabView {
                HapticTestView()
                ContentView(client: session.client)
                    .environmentObject(session)
            }
            .tabViewStyle(.verticalPage)
        }
    }
}
