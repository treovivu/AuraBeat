# Running AuraBeat on a real Apple Watch

The watch app joins the web app's dev relay as a watch. It plays the haptic cues the web app sends
and sends `movement_detected` when you wave. It uses the shared files in `watchOS/`
(`MotionDetector.swift`, `HapticManager.swift`, `WatchWebSocketClient.swift`) plus the files in this folder.

## Requirements

- A Mac with Xcode 26 or later (tested with Xcode 27).
- An iPhone paired with the Apple Watch, connected to the Mac by cable or on the same Wi-Fi.
- An Apple ID. A free account works, but the app expires after 7 days; run it again from Xcode to renew.
- Campus or office Wi-Fi often blocks devices from reaching each other. Put the Mac on the iPhone's hotspot instead.
- The Mac, iPhone and watch on the same network.

## 1. Open the project

Open `watchOS/AuraBeatWatch.xcodeproj` in Xcode. It is already set up:
- Watch-only app, watchOS 10+.
- Uses the shared `MotionDetector`, `HapticManager` and `WatchWebSocketClient` from `watchOS/`.
- `AuraBeatWatch/Info.plist` includes motion permission, the development-only `ws://` exception (ATS) and background mode "physical-therapy".

## 2. Signing

Select the **AuraBeatWatch** target, open **Signing & Capabilities**, and choose your Apple ID under **Team**
(add it first in Xcode → Settings → Accounts). If Xcode says the bundle ID is taken, change
`com.vungoctrieuvy.AuraBeatWatch` to something unique.

## 3. Point the watch at your Mac

Edit `RelayConfig.swift` and put in the Mac's address:

```sh
ifconfig en0 | grep "inet6 2"   # global IPv6 (works on Wi-Fi that isolates IPv4 clients)
ipconfig getifaddr en0          # IPv4
```

Write IPv6 in brackets, like `ws://[2600:…]:5173/__aurabeat/relay?role=watch`. Write IPv4 as `ws://192.168.1.20:5173/…`.

## 4. Developer Mode

- **iPhone:** go to Settings → Privacy & Security → Developer Mode → On, then restart the phone.
- **Watch:** after the first install attempt, go to Settings → Privacy & Security → Developer Mode → On, then restart the watch.
- The first time, Xcode may take several minutes to "prepare" the watch. Keep the watch on its charger and unlocked.
- If you're using a free Apple ID, go to iPhone Settings → General → VPN & Device Management and trust your developer certificate.

## 5. Run

1. Start the web app so the watch can reach it. Port 5173 must be free:
   ```sh
   npm run dev:watch
   ```
2. On the Mac, open **http://localhost:5173** and choose At-home Concert.
3. In Xcode, select the Watch App scheme and your watch as the destination, then press **Run**.
4. On the watch, tap **Start** and allow Motion access. The dot turns green ("Connected"), and the web app shows "Watch connected".
5. Play the concert. Around 1:10 the watch buzzes for GET READY. When the web app shows **WAVE WITH THE MUSIC**, wave your wrist side to side.

## Troubleshooting

- **Stuck on "Connecting…":**
  - Check the address in `RelayConfig.swift`.
  - Check that `npm run dev:watch` is running.
  - From the iPhone's Safari, open `http://<same address>:5173`. If the page doesn't load, the network is blocking it. Use IPv6 or a hotspot.
- **No buzz:** haptics are muted in Silent/Theater mode on some settings. Also check the watch is on your wrist.
- **Waves not detected:** the detector needs two quick wrist rolls (twisting like turning a doorknob, not moving the arm up and down) within 1.4 s. See `watchOS/README.md`.
