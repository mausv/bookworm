import path from 'node:path'
import { serve } from '@hono/node-server'
import { watchInbox } from '@/lib/inbox'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 3000)
const webRoot =
  process.env.NODE_ENV === 'production' ? path.join(process.cwd(), 'dist/web') : undefined

serve({ fetch: createApp({ webRoot }).fetch, port }, () => {
  console.log(`bookworm listening on http://localhost:${port}`)
})
watchInbox()
