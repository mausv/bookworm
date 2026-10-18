import { useQueryClient } from '@tanstack/react-query'
import { Download, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ColorMappings } from '@/web/components/color-mappings'
import { ConnectClaude } from '@/web/components/connect-claude'
import { authClient } from '@/web/lib/auth-client'
import { LOCALE_NAME, LOCALES, useLocale, useT } from '@/web/lib/i18n'
import { cn } from '@/web/lib/utils'

export function SettingsPage() {
  const t = useT()
  const { locale, setLocale } = useLocale()
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
      <h1 className="text-3xl sm:text-4xl">{t('nav.settings')}</h1>

      <section className="space-y-4">
        <h2 className="text-2xl">Language / Idioma</h2>
        <div
          role="radiogroup"
          aria-label="Language / Idioma"
          className="flex w-fit gap-1 rounded-full bg-muted p-1"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              lang={l}
              aria-checked={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                'h-10 rounded-full px-4 text-sm transition-colors sm:h-8',
                locale === l
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {LOCALE_NAME[l]}
            </button>
          ))}
        </div>
      </section>

      <ColorMappings />

      <ConnectClaude />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl">{t('settings.export')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.exportHint')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/export/json" download />}
          >
            <Download />
            {t('settings.exportJson')}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/export/vocab.tsv" download />}
          >
            <Download />
            {t('settings.exportAnki')}
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">{t('settings.account')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {user && (
            <div className="min-w-0 flex-1">
              <p className="font-medium">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut />
            {t('settings.signOut')}
          </Button>
        </div>
      </section>
    </div>
  )
}
