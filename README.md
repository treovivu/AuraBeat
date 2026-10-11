# AuraBeat

**Feel the rhythm. Follow the moment.** AuraBeat turns a concert into something you can see, feel and
move with: stage light that follows the beat, an Apple Watch that taps the music onto your wrist, live
lyrics, and Nova, a virtual performer you can talk to. It is built so Deaf and hard-of-hearing fans get
the whole show, not a reduced version of it.

## Two ways to feel a concert

### At-home Concert
A recorded performance (NEFFEX – "Grateful") becomes interactive. The video's own clock drives every
light, lyric and haptic, so nothing drifts.

```
GET READY → Apple Watch haptic → WAVE WITH THE MUSIC → wrist wave → movement_detected → the stage reacts
```

- Virtual stage (performer, LED wall, lights, crowd) or the concert video, both lit to the beat.
- Beat haptics on the watch, stronger on downbeats, and a "Get ready" buzz before each wave moment.
- Wrist waves are detected on the watch itself (wrist roll, with a gate that ignores bouncing and the
  watch's own vibration).
- Your senses: Light, Sound, Watch Haptics, Lyrics, Play Along and Reduce Motion, each switchable.

### Live Concert
At a real show the stage is the performance; the phone and watch translate the music.

```
real music → laptop microphone → onset analysis → beat / bass / build / chorus / drop → Apple Watch haptics
                                                 └─ separate lighting cues → phone lightstick
```

- Lighting and haptics are separate streams: the lightstick changes colour calmly, while the watch
  taps on actual musical onsets.
- Each musical meaning has its own watch haptic (a light tap for a beat, a heavier one for bass, a
  rising pattern for a build, and so on).
- **Stop** ends haptics immediately, on the watch too.

### Nova (ElevenLabs voice agent)
In the At-home Concert, tap **✦ Talk to Nova** and just say what you want:

| You say | Nova does |
|---|---|
| "Nova, make the concert more exciting." | `setConcertEnergy("hype")`: the stage lights up |
| "The lights are too much." | `setSensoryPreference({ reduceMotion: true })` |
| "I'm hard of hearing. Help me feel the concert." | turns on lyrics, watch haptics and light |
| "Give me a dreamy encore." | `triggerAuraMoment("encore")`: a visual-only finale look |
| "Is my watch connected?" | `getConcertStatus()`: answers from the real state |

Nova only changes presentation and your sensory preferences. She never touches the song, its timing,
BPM, lyrics or interaction windows, and a real GET READY / WAVE always takes priority over her visuals.

## Run it

Requirements: Node 20.19+ or 22.12+, a Mac on the same Wi-Fi as the iPhone/Apple Watch.

```sh
npm install
cp .env.example .env.local          # then add your ElevenLabs key to .env.local (see Nova below)
npm run dev:watch                   # http://localhost:5173 (also reachable from the watch on your LAN)
```

Open http://localhost:5173 and choose **At-home Concert** or **Live Concert**.
`npm run dev` works too when no Apple Watch is involved.

### Live microphone
```sh
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt   # once
.venv/bin/python tools/live_lightstick.py --backend http://127.0.0.1:5173
```
Keep the room quiet for the first 2 seconds (it measures the noise floor), then play music near the
laptop. `--backend` is needed with `npm run dev:watch`. macOS must allow microphone access for your
terminal (System Settings → Privacy & Security → Microphone). Details: [`tools/README.md`](tools/README.md).

### Apple Watch
The watch app lives in [`watchOS/`](watchOS) (Xcode project `watchOS/AuraBeatWatch.xcodeproj`, watchOS 10+).

1. Enable Developer Mode on the paired iPhone and the watch, connect the iPhone to the Mac.
2. In Xcode → target **AuraBeatWatch** → **Signing & Capabilities**, choose **your own Team**
   (and change the bundle ID if Xcode says it is taken).
3. Find the Mac's address: `ipconfig getifaddr en0`, and put it in
   [`watchOS/AuraBeatWatch/RelayConfig.swift`](watchOS/AuraBeatWatch/RelayConfig.swift):
   `http://<Mac IP>:5173/__aurabeat/relay`. Rebuild after changing networks.
4. Run `npm run dev:watch`, run the app on the watch, tap **Start** and wait for **Connected**.

Why HTTP: a physical Apple Watch cannot open WebSockets (watchOS blocks low-level networking for apps
that aren't streaming audio), so the watch talks to the dev server's relay with HTTP long-polling.
The simulator can still use WebSockets. More: [`watchOS/README.md`](watchOS/README.md).

### Nova
Nova is the ElevenLabs agent `Nova — AuraBeat` ([`src/nova/agent.ts`](src/nova/agent.ts)). The agent
requires authentication, so add an ElevenLabs API key with Agents access to `.env.local`:

```
ELEVENLABS_API_KEY=...
```

It has no `VITE_` prefix on purpose: only the dev server reads it ([`vite.nova.ts`](vite.nova.ts)) and
hands the browser a short-lived WebRTC conversation token. The key never reaches the browser or git.

## How it fits together

```
                  ┌─ At-home Concert (video clock) ──┐
React web app ────┤                                   ├─ watchBridge → dev-server relay ⇄ Apple Watch app
 (Vite, React 19) ├─ Live Concert ← lightstick hub ←──┘   (HTTP long-poll)   (haptics, wave detection)
                  └─ Nova ⇄ ElevenLabs (WebRTC token from the dev server)
```

| Path | What it is |
|---|---|
| `src/pages/` | Home, At-home Concert, Live Concert |
| `src/components/` | Stage, performer, crowd, lightstick, lyrics, controls |
| `src/data/grateful/` | The performance: beat grid, sections, lyrics, interaction moments |
| `src/lib/watchBridge.ts`, `watchRelay.ts` | The only way the web app reaches the watch |
| `src/live/` | Live Concert events, session and settings |
| `src/nova/` | Nova's button and client tools |
| `vite.config.ts` | Dev-server relay for the watch, live lightstick hub; `vite.nova.ts` for Nova's token |
| `watchOS/` | Apple Watch app, motion detector, haptics, and Mac-runnable tests (`sim-test/`) |
| `tools/` | Live microphone analysis (`live_lightstick.py`) |
| `public/lightstick.html` | Standalone shared lightstick page |
| `backend/` | Optional FastAPI backend (song timelines, scoring, analytics); not needed for the demo |

## Tests

```sh
npm run build && npm run lint
watchOS/sim-test/run.sh            # wave detection on 24 real motion recordings, haptics, watch link
```

## Known limitations

- Tested on a physical Apple Watch Series 8 with the AuraBeat app open and the screen awake; with the
  screen off the app may pause and the web falls back to the phone.
- The relay and Nova's token endpoint run in the dev server, so the full experience runs locally.
- The wave detector's bounce gate was tuned from a single on-wrist recording.
- A laptop microphone hears little bass, so live onsets are mostly classified as beats.
- Nova speaks English (Vietnamese is not set up on the agent yet).

## Media credits

- "Grateful" — NEFFEX. Source: Wikimedia Commons ("NEFFEX - Grateful (Copyright Free).webm").
  License: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
- Voice agent: [ElevenLabs Agents](https://elevenlabs.io/agents).
