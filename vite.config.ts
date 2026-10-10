import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

type SaveRequest =
  | { kind: 'beat'; file: string; bpm: number; anchor: number }
  | {
      kind: 'interactions'
      file: string
      interactions: { id: string; label?: string; readyAt: number; start: number; end: number }[]
    }
  | { kind: 'lyrics'; file: string; lyrics: { start: number; end: number; text: string }[] }

const num = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Not a number: ${value}`)
  return Math.round(value * 1000) / 1000
}

function replaceOnce(source: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(source)) throw new Error(`Couldn't find ${what} in the file`)
  return source.replace(pattern, replacement)
}

/** Applies a DEV calibration to a track data file and returns the new source. */
function applySave(source: string, req: SaveRequest): string {
  switch (req.kind) {
    case 'beat':
      return replaceOnce(
        replaceOnce(source, /^const BPM = [\d.]+;$/m, `const BPM = ${num(req.bpm)};`, 'const BPM'),
        /^const DOWNBEAT_ANCHOR = [\d.]+;$/m,
        `const DOWNBEAT_ANCHOR = ${num(req.anchor)};`,
        'const DOWNBEAT_ANCHOR',
      )
    case 'interactions': {
      const items = req.interactions.map(
        (c) =>
          `    { id: ${JSON.stringify(String(c.id))}, ${c.label ? `label: ${JSON.stringify(String(c.label))}, ` : ''}` +
          `readyAt: ${num(c.readyAt)}, start: ${num(c.start)}, end: ${num(c.end)} },`,
      )
      return replaceOnce(
        source,
        /^ {2}interactions: \[[\s\S]*?^ {2}\],$/m,
        `  interactions: [\n${items.join('\n')}\n  ],`,
        'the interactions block',
      )
    }
    case 'lyrics': {
      const items = req.lyrics.map(
        (l) => `  { start: ${num(l.start)}, end: ${num(l.end)}, text: ${JSON.stringify(String(l.text))} },`,
      )
      const block = items.length ? `[\n${items.join('\n')}\n]` : '[]'
      return replaceOnce(
        source,
        /^const timedLyrics: LyricLine\[\] = \[[\s\S]*?\];$/m,
        `const timedLyrics: LyricLine[] = ${block};`,
        'const timedLyrics',
      )
    }
  }
}

/**
 * Dev-server only: lets the DEV calibration tools write their values into the track data files
 * (POST /__aurabeat/save). Restricted to TypeScript files under src/data/.
 */
function devCalibrationSave(): Plugin {
  return {
    name: 'aurabeat-dev-calibration-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__aurabeat/save', (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' })
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw) as SaveRequest
            if (!/^src\/data\/[\w/-]+\.ts$/.test(body.file)) throw new Error(`Refusing to write ${body.file}`)
            const target = path.resolve(server.config.root, body.file)
            const source = await readFile(target, 'utf8')
            await writeFile(target, applySave(source, body))
            reply(200, { ok: true, file: body.file })
          } catch (error) {
            reply(400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })
      })
    },
  }
}

/**
 * Dev-server only: Wave Lab uploads the raw motion it recorded during a trial (POST /__aurabeat/lab-recording),
 * saved as JSON in lab-data/ (git-ignored) so detection can be tuned on real movement.
 */
function labRecordings(): Plugin {
  return {
    name: 'aurabeat-lab-recordings',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__aurabeat/lab-recording', (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' })
        let raw = ''
        let tooBig = false
        req.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 5_000_000) tooBig = true
        })
        req.on('end', async () => {
          try {
            if (tooBig) throw new Error('Recording too large')
            const body = JSON.parse(raw) as { trial?: unknown }
            const trial = String(body.trial ?? 'trial').replace(/[^a-z0-9-]/gi, '')
            const dir = path.resolve(server.config.root, 'lab-data')
            await mkdir(dir, { recursive: true })
            const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${trial}.json`
            await writeFile(path.join(dir, file), raw)
            reply(200, { ok: true, file: `lab-data/${file}` })
          } catch (error) {
            reply(400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })
      })
    },
  }
}

/** A raw WebSocket connection handled by the dev-server plugins below. */
type WsConn = { socket: import('node:net').Socket; buffer: Buffer }

/**
 * Minimal RFC 6455 framing (text, ping/pong, close) so the dev-server sockets need no extra dependency.
 */
const wsFrame = (text: string, opcode = 0x1) => {
  const payload = Buffer.from(text)
  const len = payload.length
  const head =
    len < 126
      ? Buffer.from([0x80 | opcode, len])
      : len < 65536
        ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff])
        : Buffer.concat([Buffer.from([0x80 | opcode, 127]), Buffer.from(new BigUint64Array([BigInt(len)]).buffer).reverse()])
  return Buffer.concat([head, payload])
}

/** Completes the WebSocket handshake for an HTTP upgrade request. */
const wsAccept = (req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex): WsConn | null => {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return null
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  return { socket: socket as import('node:net').Socket, buffer: Buffer.alloc(0) }
}

const wsSend = (c: WsConn, message: object) => {
  if (!c.socket.destroyed) c.socket.write(wsFrame(JSON.stringify(message)))
}

/** Parses complete frames from the client's buffer; returns text messages. */
const wsReadFrames = (c: WsConn): string[] => {
  const out: string[] = []
  for (;;) {
    const b = c.buffer
    if (b.length < 2) break
    const opcode = b[0] & 0x0f
    const masked = (b[1] & 0x80) !== 0
    let len = b[1] & 0x7f
    let offset = 2
    if (len === 126) {
      if (b.length < 4) break
      len = b.readUInt16BE(2)
      offset = 4
    } else if (len === 127) {
      if (b.length < 10) break
      len = Number(b.readBigUInt64BE(2))
      offset = 10
    }
    const maskOffset = offset
    if (masked) offset += 4
    if (b.length < offset + len) break
    const payload = Buffer.from(b.subarray(offset, offset + len))
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= b[maskOffset + (i % 4)]
    c.buffer = b.subarray(offset + len)
    if (opcode === 0x1) out.push(payload.toString())
    else if (opcode === 0x8) c.socket.end(wsFrame('', 0x8))
    else if (opcode === 0x9) c.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]))
  }
  return out
}

/**
 * Dev-server only: WebSocket relay between the web app ("stage") and watches (the real watch app, or a
 * phone standing in for one via watch-sim.html). Endpoint: /__aurabeat/relay?role=stage|watch
 *
 *   watch → stage:  { "type": "movement_detected", "source": "watch", "timestamp": <epoch ms> }
 *   stage → watch:  { "type": "haptic", "pattern": "...", "strength": 0..1 }  |  { "type": "stop" }
 *   relay → all:    { "type": "relay-status", "watches": n, "stages": n }
 */
function watchRelay(): Plugin {
  type Client = WsConn & { role: 'stage' | 'watch' }
  const clients = new Set<Client>()

  const broadcastStatus = () => {
    const watches = [...clients].filter((c) => c.role === 'watch').length
    const stages = clients.size - watches
    for (const c of clients) wsSend(c, { type: 'relay-status', watches, stages })
  }

  return {
    name: 'aurabeat-watch-relay',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.on('upgrade', (req, socket) => {
        const url = new URL(req.url ?? '/', 'http://relay')
        if (url.pathname !== '/__aurabeat/relay') return // leave Vite's own HMR socket alone
        const conn = wsAccept(req, socket)
        if (!conn) return
        const client: Client = { ...conn, role: url.searchParams.get('role') === 'watch' ? 'watch' : 'stage' }
        clients.add(client)
        broadcastStatus()
        socket.on('data', (chunk: Buffer) => {
          client.buffer = Buffer.concat([client.buffer, chunk])
          for (const text of wsReadFrames(client)) {
            let msg: { type?: string }
            try {
              msg = JSON.parse(text)
            } catch {
              continue
            }
            const to = client.role === 'watch' ? 'stage' : 'watch'
            const allowed = client.role === 'watch' ? msg.type === 'movement_detected' : msg.type === 'haptic' || msg.type === 'stop'
            if (!allowed) continue
            for (const c of clients) if (c.role === to) wsSend(c, msg)
          }
        })
        const drop = () => {
          if (clients.delete(client)) broadcastStatus()
        }
        socket.on('close', drop)
        socket.on('error', drop)
      })
    },
  }
}

/**
 * Dev-server only: the live lightstick backend. tools/live_lightstick.py listens to the room and posts
 * cues; every phone in the session (public/lightstick.html and the Live Concert screen) receives them.
 *
 *   GET  /health                                → { ok, clients }
 *   POST /sessions/<session>/cue                → lighting: { kind, intensity, color, duration_ms, … } → { ok, delivered }
 *   POST /sessions/<session>/haptic             → musical-onset haptics, separate from lighting:
 *                                                 { pattern: "beat" | "bass" | "build" | "chorus" | "drop" | "none",
 *                                                   intensity: 0..1, duration_ms } → { ok, delivered }
 *   POST /sessions/<session>/control            → body: { action: "stop" | "reset" }
 *   WS   /ws?role=phone&session=<session>
 *     server → phone: { v: 1, type: "welcome" | "pong" | "cue" | "haptic" | "control", session, sent_at?, payload }
 *     (cue and haptic payloads carry a server-assigned cue_id; sent_at is the server's epoch ms)
 *     phone → server: { type: "ping", payload: { client_time } }  (acks are accepted and ignored)
 *
 * The script's default backend is http://127.0.0.1:8000, so the same handlers also listen there (this Mac only).
 */
function liveLightstickHub(): Plugin {
  type Phone = WsConn & { session: string }
  const phones = new Set<Phone>()
  // 0 turns the side port off (npm run dev:watch, so a second dev server doesn't take it).
  const SIDE_PORT = Number(process.env.AURABEAT_HUB_PORT ?? 8000)
  const HAPTIC_PATTERNS = new Set(['beat', 'bass', 'build', 'chorus', 'drop', 'none'])

  const broadcast = (session: string, type: string, payload: object) => {
    const message = { v: 1, type, session, sent_at: Date.now(), payload }
    let delivered = 0
    for (const p of phones) {
      if (p.session !== session) continue
      wsSend(p, message)
      delivered++
    }
    return delivered
  }

  /** Handles the HTTP routes; returns false when the request is not ours. */
  const handle = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): boolean => {
    const url = new URL(req.url ?? '/', 'http://hub')
    const reply = (status: number, body: object) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (url.pathname === '/health') {
      reply(200, { ok: true, clients: phones.size })
      return true
    }
    const route = /^\/sessions\/([\w-]{1,64})\/(cue|haptic|control)$/.exec(url.pathname)
    if (!route) return false
    if (req.method !== 'POST') {
      reply(405, { ok: false, error: 'POST only' })
      return true
    }
    let raw = ''
    req.on('data', (chunk) => {
      if (raw.length < 10_000) raw += chunk
    })
    req.on('end', () => {
      try {
        const body = JSON.parse(raw) as Record<string, unknown>
        const [, session, kind] = route
        if (kind === 'control') {
          if (body.action !== 'stop' && body.action !== 'reset') throw new Error('action must be stop or reset')
          return reply(200, { ok: true, delivered: broadcast(session, 'control', { action: body.action }) })
        }
        if (kind === 'haptic') {
          if (!HAPTIC_PATTERNS.has(body.pattern as string)) throw new Error('unknown haptic pattern')
          const intensity = Number(body.intensity)
          const duration = Number(body.duration_ms)
          const haptic = {
            // The sender's id when it gives one, so a cue can be followed end to end.
            cue_id: typeof body.cue_id === 'string' && /^[\w-]{1,64}$/.test(body.cue_id) ? body.cue_id : randomUUID(),
            pattern: body.pattern,
            intensity: Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5,
            duration_ms: Number.isFinite(duration) && duration > 0 ? Math.min(1000, duration) : 0,
          }
          const delivered = broadcast(session, 'haptic', haptic)
          // DEBUG (temporary)
          console.log(
            `HAPTIC BROADCAST cue_id=${haptic.cue_id} pattern=${haptic.pattern} session=${session} ` +
              `connected_clients=${[...phones].filter((p) => p.session === session).length} delivered=${delivered}`,
          )
          return reply(200, { ok: true, delivered })
        }
        if (typeof body.kind !== 'string') throw new Error('cue needs a kind')
        const cue = { ...body, cue_id: randomUUID() }
        reply(200, { ok: true, delivered: broadcast(session, 'cue', cue) })
      } catch (error) {
        reply(400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })
    return true
  }

  const upgrade = (req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex) => {
    const url = new URL(req.url ?? '/', 'http://hub')
    if (url.pathname !== '/ws') return // leave Vite's own HMR socket and the watch relay alone
    const conn = wsAccept(req, socket)
    if (!conn) return
    const phone: Phone = { ...conn, session: url.searchParams.get('session') || 'demo' }
    phones.add(phone)
    // DEBUG (temporary): who connects / disconnects
    const ua = String(req.headers['user-agent'] ?? '')
    const who = `${req.socket.remoteAddress} [${/Android[^;)]*;\s*([^;)]+)/.exec(ua)?.[1] ?? (/iPhone/.test(ua) ? 'iPhone' : /Macintosh/.test(ua) ? 'Mac' : ua.slice(0, 30))}] role=${url.searchParams.get('role')}`
    console.log(`PHONE CONNECT ${who} clients=${phones.size}`)
    socket.on('close', () => console.log(`PHONE DISCONNECT ${who}`))
    wsSend(phone, { v: 1, type: 'welcome', session: phone.session, payload: { role: url.searchParams.get('role') ?? 'phone' } })
    socket.on('data', (chunk: Buffer) => {
      phone.buffer = Buffer.concat([phone.buffer, chunk])
      for (const text of wsReadFrames(phone)) {
        let msg: { type?: string; payload?: { client_time?: unknown } }
        try {
          msg = JSON.parse(text)
        } catch {
          continue
        }
        // DEBUG (temporary): phone-haptic diagnostics reported by lightstick.html
        if (msg.type === 'diag') {
          const d = (msg.payload ?? {}) as Record<string, unknown>
          const ua = String(d.ua ?? '')
          const device = /Android[^;)]*;\s*([^;)]+)/.exec(ua)?.[1] ?? (/iPhone/.test(ua) ? 'iPhone' : ua.slice(0, 40))
          console.log(
            `PHONE DIAG [${device}] ${d.event}: ${d.detail} | vibrate=${d.vibrate} hidden=${d.hidden} ` +
              `enabled=${d.enabled} active=${d.active} ready=${d.ready} playback=${d.playbackAllowed} offset=${d.offset}`,
          )
        }
        if (msg.type === 'ping') {
          wsSend(phone, {
            v: 1,
            type: 'pong',
            session: phone.session,
            payload: { client_time: msg.payload?.client_time, server_time: Date.now() },
          })
        }
      }
    })
    const drop = () => void phones.delete(phone)
    socket.on('close', drop)
    socket.on('error', drop)
  }

  return {
    name: 'aurabeat-live-lightstick-hub',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handle(req, res)) next()
      })
      server.httpServer?.on('upgrade', upgrade)

      // The same hub on http://127.0.0.1:8000 for the microphone script.
      if (!SIDE_PORT) return
      const side = createServer((req, res) => {
        if (!handle(req, res)) {
          res.statusCode = 404
          res.end()
        }
      })
      side.on('upgrade', upgrade)
      // After a config reload the previous server may still hold the port for a moment: retry briefly.
      let attempts = 0
      side.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && ++attempts <= 20) {
          setTimeout(() => side.listen(SIDE_PORT, '127.0.0.1'), 250)
          return
        }
        server.config.logger.warn(
          `[lightstick] port ${SIDE_PORT} unavailable (${error.code}); point the mic script at this dev server with --backend instead.`,
        )
      })
      side.on('listening', () => attempts && server.config.logger.info(`[lightstick] port ${SIDE_PORT} ready`))
      side.listen(SIDE_PORT, '127.0.0.1')
      server.httpServer?.on('close', () => side.close())
    },
  }
}

/**
 * `npm run dev:lab`: HTTPS on the local network, so a phone can open the dev tools (e.g. Wave Lab) —
 * phones only expose motion sensors to secure pages. Uses a self-signed certificate in .cert/
 * (git-ignored). Plain `npm run dev` is unchanged.
 */
const labHttps =
  process.env.AURABEAT_HTTPS === '1' && existsSync('.cert/key.pem') && existsSync('.cert/cert.pem')
    ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devCalibrationSave(), labRecordings(), watchRelay(), liveLightstickHub()],
  server: labHttps ? { https: labHttps, host: true } : undefined,
})
