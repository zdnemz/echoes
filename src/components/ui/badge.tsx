import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center border-2 px-2 py-0.5 font-mono text-xs font-bold uppercase w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent transition-colors overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-foreground bg-foreground text-background',
        secondary: 'border-foreground bg-muted text-foreground',
        destructive: 'border-foreground bg-accent text-background',
        outline: 'border-foreground bg-background text-foreground [a&]:hover:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
