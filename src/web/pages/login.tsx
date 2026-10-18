import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/web/components/auth-shell'
import { authClient } from '@/web/lib/auth-client'
import { useT } from '@/web/lib/i18n'
import { nextPath, signedOAuthQuery } from '@/web/lib/url'

export function LoginPage() {
  const t = useT()
  const { search } = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    const { data, error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
      fetchOptions: { body: { oauth_query: signedOAuthQuery(search) } },
    })
    setPending(false)
    if (error) return setError(error.message ?? t('auth.signInFailed'))
    if (data.redirect) return
    navigate(nextPath(search), { replace: true })
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl">{t('auth.signIn')}</h1>
          <p className="text-muted-foreground">{t('auth.signInSubtitle')}</p>
        </div>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <Button type="submit" disabled={pending}>
              {pending ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('auth.noAccount')}{' '}
              <Link to={`/signup${search}`} className="text-primary underline underline-offset-4">
                {t('auth.signUp')}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </AuthShell>
  )
}
