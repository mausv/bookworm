import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/web/components/auth-shell'
import { authClient } from '@/web/lib/auth-client'

export function ConsentPage() {
  const { search } = useLocation()
  const clientId = new URLSearchParams(search).get('client_id') ?? ''
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const client = useQuery({
    queryKey: ['oauth-client', clientId],
    queryFn: async () => {
      const { data, error } = await authClient.$fetch<{ client_name?: string }>(
        '/oauth2/public-client',
        { query: { client_id: clientId } }
      )
      if (error) throw new Error(error.message ?? 'Unknown app')
      return data
    },
  })
  const name = client.data?.client_name ?? 'An app'

  async function respond(accept: boolean) {
    setPending(true)
    const { data, error } = await authClient.$fetch<{ url: string }>('/oauth2/consent', {
      method: 'POST',
      body: { accept, oauth_query: search.slice(1) },
    })
    if (error) {
      setPending(false)
      return setError(error.message ?? 'Could not complete the request')
    }
    window.location.assign(data.url)
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl">Connect {client.isPending ? '…' : name}</h1>
          <p className="text-muted-foreground">{name} wants access to your Bookworm library.</p>
        </div>
        {client.error && <p className="text-sm text-destructive">{client.error.message}</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Read your books, highlights, vocabulary and lore</li>
          <li>Classify highlights, add definitions and write lore entries</li>
          <li>Stay connected until you revoke access in Settings</li>
        </ul>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => respond(false)}
          >
            Deny
          </Button>
          <Button className="flex-1" disabled={pending} onClick={() => respond(true)}>
            Approve
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </AuthShell>
  )
}
