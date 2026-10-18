import { useQueryClient } from '@tanstack/react-query'
import { Download, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ColorMappings } from '@/web/components/color-mappings'
import { ConnectClaude } from '@/web/components/connect-claude'
import { authClient } from '@/web/lib/auth-client'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const session = authClient.useSession()
  const user = session.data?.user

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-12">
      <h1 className="text-3xl sm:text-4xl">Settings</h1>

      <ColorMappings />

      <ConnectClaude />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl">Export</h2>
          <p className="text-sm text-muted-foreground">
            Per-book Markdown for Obsidian is in each book’s menu.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/export/json" download />}
          >
            <Download />
            Everything as JSON
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/export/vocab.tsv" download />}
          >
            <Download />
            All vocab for Anki
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">Account</h2>
        <div className="flex flex-wrap items-center gap-4">
          {user && (
            <div className="min-w-0 flex-1">
              <p className="font-medium">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </section>
    </div>
  )
}
