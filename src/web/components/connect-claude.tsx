import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plug, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api } from '@/web/lib/api'
import { useLocale, useT } from '@/web/lib/i18n'
import type { ApiKey, Connection } from '@/web/lib/types'
import { CopyBlock } from './copy-block'

export function ConnectClaude() {
  const t = useT()
  const { locale } = useLocale()
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
  const queryClient = useQueryClient()
  const endpoint = `${window.location.origin}/mcp`
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ name: string; key: string }>()

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api<{ keys: ApiKey[] }>('/api-keys'),
  })
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<{ clients: Connection[] }>('/connections'),
  })

  const createKey = useMutation({
    mutationFn: (keyName: string) =>
      api<{ id: string; key: string }>('/api-keys', { method: 'POST', json: { name: keyName } }),
    onSuccess: ({ key }, keyName) => {
      setCreated({ name: keyName, key })
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => api(`/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
    onError: (error) => toast.error(error.message),
  })

  const revokeConnection = useMutation({
    mutationFn: (clientId: string) =>
      api(`/connections/${encodeURIComponent(clientId)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
    onError: (error) => toast.error(error.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    createKey.mutate(name.trim())
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl">{t('claude.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('claude.description')}</p>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg">{t('claude.desktopTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('claude.desktopSteps')}</p>
        <CopyBlock label={t('claude.connectorUrl')} text={endpoint} />
      </section>

      <section className="space-y-2">
        <h3 className="text-lg">Claude Code</h3>
        <CopyBlock
          label={t('claude.command')}
          text={`claude mcp add --transport http bookworm ${endpoint}`}
        />
        <p className="text-sm text-muted-foreground">
          {t('claude.codeStepsBefore')} <code className="font-mono">/mcp</code>{' '}
          {t('claude.codeStepsAfter')}
        </p>
      </section>

      {!!connections.data?.clients.length && (
        <section className="space-y-2">
          <h3 className="text-lg">{t('claude.connectedApps')}</h3>
          <ul className="divide-y">
            {connections.data.clients.map((c) => (
              <li key={c.clientId} className="flex items-center gap-2 py-2">
                <Plug aria-hidden className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name ?? t('claude.unnamedApp')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('claude.connectedOn', { date: formatDate(c.connectedAt) })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('claude.revoke', { name: c.name ?? t('claude.unnamedApp') })}
                  disabled={revokeConnection.isPending}
                  onClick={() => revokeConnection.mutate(c.clientId)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg">{t('claude.apiKeys')}</h3>
          <p className="text-sm text-muted-foreground">{t('claude.apiKeysDescription')}</p>
        </div>
        {!!keys.data?.keys.length && (
          <ul className="divide-y">
            {keys.data.keys.map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-2">
                <KeyRound aria-hidden className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('claude.createdOn', { date: formatDate(k.createdAt) })}
                    {k.lastUsedAt && t('claude.lastUsed', { date: formatDate(k.lastUsedAt) })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('claude.revoke', { name: k.name })}
                  disabled={revokeKey.isPending}
                  onClick={() => revokeKey.mutate(k.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="api-key-name">{t('claude.keyName')}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="api-key-name"
                  placeholder={t('claude.keyNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" disabled={createKey.isPending || !name.trim()}>
                  {createKey.isPending ? t('claude.creating') : t('claude.createKey')}
                </Button>
              </div>
              {createKey.error && <FieldError>{createKey.error.message}</FieldError>}
            </Field>
          </FieldGroup>
        </form>

        {created && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm">{t('claude.keyCreated', { name: created.name })}</p>
            <CopyBlock label={t('claude.apiKey')} text={created.key} />
            <CopyBlock
              label={t('claude.codeCommand')}
              text={`claude mcp add --transport http bookworm ${endpoint} --header "Authorization: Bearer ${created.key}"`}
            />
          </div>
        )}
      </section>
    </section>
  )
}
