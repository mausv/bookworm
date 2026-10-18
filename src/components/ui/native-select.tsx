import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/web/lib/utils'

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div data-slot="native-select-wrapper" className={cn('relative w-fit min-w-0', className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-9 pl-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive sm:h-10 sm:text-sm dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
