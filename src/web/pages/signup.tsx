import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/web/components/auth-shell'
import { authClient } from '@/web/lib/auth-client'
import { nextPath, signedOAuthQuery } from '@/web/lib/url'

export function SignupPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    const { data, error } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
      fetchOptions: {
        body: { inviteCode: String(form.get('inviteCode')), oauth_query: signedOAuthQuery(search) },
      },
    })
    setPending(false)
    if (error) return setError(error.message ?? 'Sign up failed')
    if ('redirect' in data) return
    navigate(nextPath(search), { replace: true })
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl">Create account</h1>
          <p className="text-muted-foreground">You need an invite code to join.</p>
        </div>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="inviteCode">Invite code</FieldLabel>
              <Input id="inviteCode" name="inviteCode" autoComplete="off" required />
            </Field>
            <FieldError>{error}</FieldError>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating account…' : 'Sign up'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to={`/login${search}`} className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </AuthShell>
  )
}
