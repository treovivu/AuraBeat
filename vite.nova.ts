import { loadEnv, type Plugin } from 'vite'
import { NOVA_AGENT_ID } from './src/nova/agent.ts'

/**
 * Dev-server only: GET /__aurabeat/nova/token → { token }, a short-lived WebRTC conversation token for the
 * Nova agent (which requires authentication). ELEVENLABS_API_KEY is read here, on the server, from
 * .env.local (no VITE_ prefix, so it never reaches the browser bundle); only the token is returned.
 */
export function novaToken(): Plugin {
  let apiKey = ''
  return {
    name: 'aurabeat-nova-token',
    apply: 'serve',
    configResolved(config) {
      apiKey = loadEnv(config.mode, config.root, '').ELEVENLABS_API_KEY ?? ''
    },
    configureServer(server) {
      server.middlewares.use('/__aurabeat/nova/token', async (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'GET') return reply(405, { error: 'GET only' })
        // Only pages served by this dev server may ask for a token (blocks other websites in the browser).
        const origin = req.headers.origin
        if (origin && new URL(origin).host !== req.headers.host) return reply(403, { error: 'Cross-origin request refused' })
        if (!apiKey) return reply(500, { error: 'ELEVENLABS_API_KEY is not set in .env.local' })
        try {
          const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${NOVA_AGENT_ID}`,
            { headers: { 'xi-api-key': apiKey } },
          )
          const data = (await response.json().catch(() => ({}))) as { token?: string }
          if (!response.ok || !data.token) return reply(502, { error: `ElevenLabs refused the token request (HTTP ${response.status})` })
          reply(200, { token: data.token })
        } catch {
          reply(502, { error: 'Could not reach ElevenLabs' })
        }
      })
    },
  }
}
