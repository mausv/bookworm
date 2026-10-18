import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plug, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api } from '@/web/lib/api'
import type { ApiKey, Connection } from '@/web/lib/types'
import { CopyBlock } from './copy-block'

const keyDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })

function formatDate(iso: string) {
  return keyDate.format(new Date(iso))
}

export function ConnectClaude() {
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
        <h2 className="text-2xl">Connect Claude</h2>
        <p className="text-sm text-muted-foreground">
          Let Claude read your highlights, define new words, sort the unclassified ones and keep
          lore notes, over MCP.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg">Claude.ai and Claude Desktop</h3>
        <p className="text-sm text-muted-foreground">
          Settings, Connectors, Add custom connector: paste this URL, then sign in and approve.
        </p>
        <CopyBlock label="Connector URL" text={endpoint} />
      </section>

      <section className="space-y-2">
        <h3 className="text-lg">Claude Code</h3>
        <CopyBlock label="Command" text={`claude mcp add --transport http bookworm ${endpoint}`} />
        <p className="text-sm text-muted-foreground">
          Then run <code className="font-mono">/mcp</code> in Claude Code to sign in and approve.
        </p>
      </section>

      {!!connections.data?.clients.length && (
        <section className="space-y-2">
          <h3 className="text-lg">Connected apps</h3>
          <ul className="divide-y">
            {connections.data.clients.map((c) => (
              <li key={c.clientId} className="flex items-center gap-2 py-2">
                <Plug aria-hidden className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name ?? 'Unnamed app'}</p>
                  <p className="text-sm text-muted-foreground">
                    Connected {formatDate(c.connectedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke ${c.name ?? 'Unnamed app'}`}
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
          <h3 className="text-lg">API keys</h3>
          <p className="text-sm text-muted-foreground">
            For scripts and MCP clients that send a bearer header, and for importing with curl.
          </p>
        </div>
        {!!keys.data?.keys.length && (
          <ul className="divide-y">
            {keys.data.keys.map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-2">
                <KeyRound aria-hidden className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatDate(k.createdAt)}
                    {k.lastUsedAt && `, last used ${formatDate(k.lastUsedAt)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke ${k.name}`}
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
              <FieldLabel htmlFor="api-key-name">Key name</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="api-key-name"
                  placeholder="Kindle sync script"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" disabled={createKey.isPending || !name.trim()}>
                  {createKey.isPending ? 'Creating…' : 'Create key'}
                </Button>
              </div>
              {createKey.error && <FieldError>{createKey.error.message}</FieldError>}
            </Field>
          </FieldGroup>
        </form>

        {created && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm">
              Key <span className="font-medium">{created.name}</span> created. Copy it now, it won’t
              be shown again.
            </p>
            <CopyBlock label="API key" text={created.key} />
            <CopyBlock
              label="Claude Code command"
              text={`claude mcp add --transport http bookworm ${endpoint} --header "Authorization: Bearer ${created.key}"`}
            />
          </div>
        )}
      </section>
    </section>
  )
}
