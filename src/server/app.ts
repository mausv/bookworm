import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { auth, hasAccount } from '@/lib/auth'
import { api } from './api'
import { handleMcp } from './mcp'

export function createApp({ webRoot }: { webRoot?: string } = {}) {
  const app = new Hono()

  app.get('/healthz', (c) => c.json({ ok: true }))
  app.get('/api/setup', (c) => c.json({ hasAccount: hasAccount() }))
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  app.get('/.well-known/oauth-authorization-server', (c) => auth.handler(c.req.raw))
  app.get('/.well-known/oauth-protected-resource', (c) => auth.handler(c.req.raw))
  app.post('/mcp', (c) => handleMcp(c.req.raw))
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.json({ error: 'Method not allowed' }, 405))
  app.route('/api', api)

  if (webRoot) {
    const index = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), webRoot) }))
    app.get('*', (c) => c.html(index))
  }

  return app
}
