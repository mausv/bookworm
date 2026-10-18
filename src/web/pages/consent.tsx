import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/web/components/auth-shell'
import { authClient } from '@/web/lib/auth-client'
import { useT } from '@/web/lib/i18n'

export function ConsentPage() {
  const t = useT()
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
      if (error) throw new Error(error.message ?? t('consent.unknownApp'))
      return data
    },
  })
  const name = client.data?.client_name ?? t('consent.anApp')

  async function respond(accept: boolean) {
    setPending(true)
    const { data, error } = await authClient.$fetch<{ url: string }>('/oauth2/consent', {
      method: 'POST',
      body: { accept, oauth_query: search.slice(1) },
    })
    if (error) {
      setPending(false)
      return setError(error.message ?? t('consent.failed'))
    }
    window.location.assign(data.url)
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl">
            {t('consent.title', { name: client.isPending ? '…' : name })}
          </h1>
          <p className="text-muted-foreground">{t('consent.wants', { name })}</p>
        </div>
        {client.error && <p className="text-sm text-destructive">{client.error.message}</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t('consent.read')}</li>
          <li>{t('consent.write')}</li>
          <li>{t('consent.stay')}</li>
        </ul>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => respond(false)}
          >
            {t('consent.deny')}
          </Button>
          <Button className="flex-1" disabled={pending} onClick={() => respond(true)}>
            {t('consent.approve')}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </AuthShell>
  )
}
