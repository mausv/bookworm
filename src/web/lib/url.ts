export function signedOAuthQuery(search: string) {
  const params = new URLSearchParams(search)
  return params.has('sig') ? params.toString() : undefined
}

export function nextPath(search: string) {
  const next = new URLSearchParams(search).get('next')
  return next && /^\/(?![/\\])/.test(next) ? next : '/'
}

export function loginPath(path: string) {
  return `/login?${new URLSearchParams({ next: path })}`
}

export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) query.set(key, String(value))
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}
