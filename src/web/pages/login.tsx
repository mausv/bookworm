import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/web/components/auth-shell'
import { authClient } from '@/web/lib/auth-client'
import { nextPath, signedOAuthQuery } from '@/web/lib/url'

export function LoginPage() {
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
    if (error) return setError(error.message ?? 'Sign in failed')
    if (data.redirect) return
    navigate(nextPath(search), { replace: true })
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl">Sign in</h1>
          <p className="text-muted-foreground">Pick up where you left off.</p>
        </div>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
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
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-sm text-muted-foreground">
              No account?{' '}
              <Link to={`/signup${search}`} className="text-primary underline underline-offset-4">
                Sign up
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </AuthShell>
  )
}
