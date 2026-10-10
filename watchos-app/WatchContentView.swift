import SwiftUI

struct WatchContentView: View {
    @StateObject var connectivity = WatchConnectivityManager.shared
    @StateObject var motion = MotionManager()
    @State private var isRunning = false
    @State private var localScore = 0
    
    var body: some View {
        VStack(spacing: 12) {
            Text("AuraBeat")
                .font(.headline)
                .foregroundColor(.pink)
            
            // Connection Status
            HStack {
                Circle()
                    .fill(connectivity.isConnected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text(connectivity.isConnected ? "Connected" : "Disconnected")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            
            if isRunning {
                Text("Score: \(localScore)")
                    .font(.system(size: 18, weight: .bold))
                
                if motion.isWaving {
                    Text("WAVE DETECTED!")
                        .font(.caption)
                        .foregroundColor(.yellow)
                }
            }
            
            // Start / Stop Controls
            Button(action: {
                isRunning.toggle()
                if isRunning {
                    motion.startTracking()
                    motion.onMovementDetected = {
                        localScore += 10
                        connectivity.sendMovementData(score: Double(localScore))
                    }
                } else {
                    motion.stopTracking()
                }
            }) {
                Text(isRunning ? "Stop Concert" : "Start Concert")
                    .fontWeight(.bold)
            }
            .tint(isRunning ? .red : .green)
            
            // Haptic Preview Button
            Button("Test Haptics") {
                HapticManager.shared.previewHaptics()
            }
            .font(.footnote)
        }
        .padding()
    }
}