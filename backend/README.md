# AuraBeat backend (FastAPI)

One WebSocket that the phone app and the watch connect to. Real song beats, live mic beats, wrist waves, Tiger Data analytics and Gemini song descriptions all go through it.

```
 song timeline / live mic ──▶ backend ──▶ phones (lightstick + cue words + vibration on Android)
                                  │  └──▶ watches (haptics)
 watch wrist wave ──────────────▶ │ ──▶ phones (At-home "wave with the music")
 At-home phone (video clock) ───▶ │ ──▶ watches (haptics in sync with the video)
                                  └──▶ Tiger Data (every cue, latency sample, wave)
```

## Run it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Frontend (AuraBeat), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Phones on the same hotspot open `http://<laptop-ip>:5173`. The app finds the backend by itself at `ws://<laptop-ip>:8001`.

## Play the real song to everyone

`timelines/grateful.json` holds NEFFEX "Grateful" measured from the actual audio: 118 beats, 78 bass hits, 156 percussion hits, 3 builds, 2 drops, 2 choruses. It's already generated.

```bash
python scripts/play_song.py              # plays the song on the laptop and sends its beats, in sync
python scripts/play_song.py --from 60    # jump to just before the first drop (needs ffmpeg on Mac)
python scripts/play_song.py --silent     # beats only; the music plays from somewhere else
python scripts/play_song.py --nudge 80   # beats 80 ms later, if they feel early against the speakers
```

The dashboard (`/dashboard`) also has Play/Stop buttons.

## Live mic mode (real venue)

```bash
pip install -r requirements-audio.txt
python scripts/live_audio.py             # measures room noise for 2 s, then sends bass/percussion/drop live
python scripts/live_audio.py --list      # pick a different input device
```

Tested on the Grateful audio: about 1.5 hits per second, and it found both real drops around 2 s late (it needs about 2 s of loudness to be sure). There was also one false drop at 0:31. Treat it as a demo of live mode. The prepared timeline is the accurate one.

## A new song

```bash
pip install -r requirements-audio.txt
python scripts/analyze_song.py media/mysong.mp3 --out timelines/mysong.json
```

Add `--bpm`/`--anchor` if you know the tempo and a downbeat, and `--sections file.json` for named sections. Otherwise it guesses drops from loudness. Put the audio at `media/mysong.mp3` so `play_song.py --song mysong` can play it.

## Tiger Data

1. Create a free service at console.cloud.timescale.com (Tiger Cloud) and copy its connection string.
2. Before starting the server:
   ```bash
   export TIGER_DATABASE_URL="postgres://tsdbadmin:PASSWORD@HOST:PORT/tsdb?sslmode=require"
   ```
3. Start the server. It creates 4 hypertables (`cue_events`, `device_latency`, `movements`, `connections`) and a continuous aggregate (`cue_activity_1m`).
4. Open `http://localhost:8001/dashboard`, or GET `/stats/demo` for JSON.

Writes are queued and batched every 0.5 s, so a slow database never delays a beat. Without the variable, everything still works and the dashboard says Tiger Data is off.

## Gemini

1. Get a key at aistudio.google.com/apikey.
2. ```bash
   export GEMINI_API_KEY="..."
   # optional: export GEMINI_MODEL="gemini-3.5-flash"
   ```
3. Restart the server, then:
   ```bash
   curl -X POST localhost:8001/ai/analyze/grateful
   ```

Gemini listens to `media/grateful.mp3` and returns the song's sections, a short description of each ("huge bass, full band"), and standout sound moments ("[bass drops]"). Those words are written onto the BUILD/DROP/CHORUS cues, so the phone shows them under the big cue word. librosa still decides when beats happen; Gemini describes what they are. The result is saved in `timelines/grateful.ai.json`.

## At-home Play Along (scoring)

The phone opens a private attempt (`attempt` message) and reports its video clock (`playback`, every second plus on play, pause, seek and end). The backend:

- picks target beats: bar downbeats inside the song's "wave with the music" windows, 8 for Grateful, about 3.2 s apart.
- maps each watch wave onto the video clock using the watch's own timestamp and clock offset.
- scores it: ±200 ms is On beat (100), ±350 ms is Close (50). Each target is judged once, with a 700 ms cooldown per watch. Confidence below 0.5 never counts.
- marks targets the music passes as Missed (only while playing). Pause and buffering freeze everything. A seek or restart starts a fresh attempt.
- holds back haptic cues to the watch within ±350 ms of a target (the "quiet zone"), so a still wrist on a buzzing watch can't score.
- sends `score` and `results` to that phone only, and stores results in Tiger Data.

Rules live in `app/attempts.py` (rule version `v1`). `GET /attempts` shows live state.

## Announcements

```bash
curl -X POST localhost:8001/sessions/demo/announce -H 'content-type: application/json' \
  -d '{"text":"Encore starts in 5 minutes","urgent":false}'
```

The text shows on every phone (above the full-screen lightstick too) and buzzes every watch. Phones that join within 15 minutes get the latest one. The dashboard has a box for it.

## Ambient lightstick page

`/lightstick` is a standalone colour-blend lightstick (slow blends for soft music, sharp changes for energetic music, a steady-colour option). Drive it with `python scripts/live_lightstick.py`, or with any cue source.

## Deploying

The backend serves the built phone app when it finds `frontend_dist/` (or `FRONTEND_DIST`), so one HTTPS address does everything. See `../DEPLOY.md` (Docker + Caddy on Vultr).

## Messages

Every message is `{ v, type, id, session, sent_at, payload }`. Types and examples are in `shared/messages.ts` (phone) and `shared/Messages.kt` (watch), and live at `/schema/examples`.

| type | direction | purpose |
|---|---|---|
| `cue` | server → phone + watch | beat, bass, percussion, build, drop, chorus (+ `text` words) |
| `cue` | phone → server → watches | At-home haptics, timed by the phone's video |
| `status` | server → all | `listening` / `lost` / `idle`, plus song title |
| `presence` | server → all | how many phones/watches are connected |
| `movement` → `movement_detected` | watch → server → phones | wrist wave |
| `control` | server → all | stop, haptics_on/off, reset |
| `attempt` / `playback` | phone → server | At-home: open the attempt, report the video clock |
| `attempt` / `score` / `results` | server → that phone | target beats, each judged wave, final results |
| `announcement` | server → all | staff announcement text (+ `urgent`) |
| `ping`/`pong`, `ack` | both | latency, stored in Tiger Data |

## Useful URLs

| | |
|---|---|
| `/dashboard` | show stats + play/stop |
| `/integrations` | is Tiger Data / Gemini on |
| `/clients` | who's connected, live latency |
| `/timelines` | songs ready to play |
| `/docs` | click-to-send any endpoint |
| `/test` | bare-bones phone flash page |
| `/lightstick` | ambient colour lightstick |
| `/attempts` | live Play Along state |
| `/sessions/demo/announcements` | recent announcements |

## Tests

```bash
pytest -q      # 32 tests: messaging, timelines, scoring rules, quiet zone, pause/seek, privacy, announcements, mic watchdog
```
