import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { verifyApiKey } from '@/lib/api-keys'
import { issuer } from '@/lib/auth'
import { verifyAccessToken } from '@/lib/oauth'
import { createMcpServer } from '@/mcp/server'

function unauthorized(tokenPresent: boolean) {
  const challenge = `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`
  return Response.json(
    { error: 'Invalid or missing access token' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': tokenPresent ? `${challenge}, error="invalid_token"` : challenge,
      },
    }
  )
}

export async function handleMcp(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return unauthorized(false)
  const userId = (await verifyAccessToken(token)) ?? verifyApiKey(token)
  if (!userId) return unauthorized(true)

  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}
