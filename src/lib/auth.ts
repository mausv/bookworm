import { mcp } from '@better-auth/mcp'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { assertValidInviteCode } from './invite-code'

const baseURL = process.env.BETTER_AUTH_URL
if (!baseURL) throw new Error('BETTER_AUTH_URL is not set')

export const issuer = baseURL
export const mcpResource = `${issuer}/mcp`

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  advanced: { database: { generateId: 'uuid' } },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email') {
        assertValidInviteCode(ctx.body?.inviteCode, process.env.INVITE_CODE)
      }
    }),
  },
  plugins: [
    jwt({ jwt: { issuer } }),
    mcp({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      resource: mcpResource,
      scopes: ['offline_access'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
  ],
})
