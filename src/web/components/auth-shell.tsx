import type { ReactNode } from 'react'
import { AppIcon } from './app-icon'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-10 sm:py-16">
      <p className="mx-auto mb-10 flex items-center gap-3 font-heading text-3xl italic">
        <AppIcon className="size-10" />
        Bookworm
      </p>
      <main className="mx-auto w-full max-w-sm">{children}</main>
    </div>
  )
}
