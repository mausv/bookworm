import { useQuery } from '@tanstack/react-query'
import { Inbox, Layers, Library, type LucideIcon, Settings, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { api } from '@/web/lib/api'
import { authClient } from '@/web/lib/auth-client'
import { type MessageKey, useT } from '@/web/lib/i18n'
import type { Book } from '@/web/lib/types'
import { loginPath } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'
import { AppIcon } from './app-icon'
import { ImportDialog } from './import-dialog'

export interface ShellContext {
  openImport: () => void
}

const NAV: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: '/', label: 'nav.library', icon: Library },
  { to: '/triage', label: 'nav.triage', icon: Inbox },
  { to: '/review', label: 'nav.review', icon: Layers },
  { to: '/settings', label: 'nav.settings', icon: Settings },
]

export function RequireAuth() {
  const location = useLocation()
  const session = authClient.useSession()
  if (session.isPending) return null
  if (!session.data) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  return <Outlet />
}

export function AppShell() {
  const t = useT()
  const [importing, setImporting] = useState(false)
  const books = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
  })
  const unclassified = books.data?.books.reduce((sum, b) => sum + b.counts.unclassified, 0) ?? 0
  const context: ShellContext = { openImport: () => setImporting(true) }

  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading text-2xl leading-none italic"
          >
            <AppIcon className="size-7" />
            Bookworm
          </Link>
          <nav aria-label={t('nav.main')} className="hidden flex-1 gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors hover:text-foreground',
                    isActive
                      ? 'font-medium text-foreground after:absolute after:inset-x-3 after:-bottom-[11px] after:h-0.5 after:bg-foreground'
                      : 'text-muted-foreground'
                  )
                }
              >
                {t(item.label)}
                {item.to === '/triage' && <CountBadge count={unclassified} />}
              </NavLink>
            ))}
          </nav>
          <Button
            variant="outline"
            className="ml-auto"
            onClick={context.openImport}
            aria-label={t('import.title')}
          >
            <Upload />
            <span className="hidden sm:inline">{t('import.button')}</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-12 sm:pt-10">
        <Outlet context={context} />
      </main>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-xs',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )
                }
              >
                <span className="relative">
                  <item.icon aria-hidden className="size-5" />
                  {item.to === '/triage' && (
                    <CountBadge count={unclassified} className="absolute -top-1.5 left-3.5" />
                  )}
                </span>
                {t(item.label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  )
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  const t = useT()
  if (!count) return null
  return (
    <span
      className={cn(
        'min-w-5 rounded-full bg-foreground px-1.5 text-center text-[0.7rem] leading-5 font-medium text-background tabular-nums',
        className
      )}
    >
      {count > 999 ? '999+' : count}
      <span className="sr-only"> {t('nav.unclassifiedSr')}</span>
    </span>
  )
}
