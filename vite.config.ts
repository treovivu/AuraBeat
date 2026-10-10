import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devCalibrationSave()],
})
