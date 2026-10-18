import { currentLocale, translate } from './i18n'
import type { ImportResponse } from './types'
import { loginPath } from './url'

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  json?: unknown
}

async function send(path: string, init: RequestInit) {
  const res = await fetch(`/api${path}`, init)
  if (res.status === 401) {
    window.location.assign(loginPath(window.location.pathname + window.location.search))
    throw new Error('Signed out')
  }
  return res
}

async function errorMessage(res: Response) {
  const body: unknown = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return translate(currentLocale(), 'error.requestFailed', { status: res.status })
}

export async function api<T>(path: string, { method = 'GET', json }: Options = {}): Promise<T> {
  const res = await send(path, {
    method,
    headers: json === undefined ? undefined : { 'content-type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export async function importFiles(files: File[], source?: string): Promise<ImportResponse> {
  const form = new FormData()
  for (const file of files) form.append('file', file)
  const res = await send(source ? `/import?source=${source}` : '/import', {
    method: 'POST',
    body: form,
  })
  if (!res.ok && res.status !== 422) throw new Error(await errorMessage(res))
  return res.json()
}
