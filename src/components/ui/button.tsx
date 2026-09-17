import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border-2 border-foreground text-sm font-bold uppercase tracking-wide transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
        destructive:
          'bg-accent text-background shadow-brutal-accent hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
        outline:
          'bg-background text-foreground shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none',
        secondary:
          'bg-muted text-foreground border-foreground shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none',
        ghost: 'bg-transparent text-foreground border-transparent shadow-none hover:bg-muted',
        link: 'text-foreground border-transparent shadow-none underline underline-offset-4 hover:text-accent',
      },
      size: {
        default: 'h-10 px-5 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5 text-xs',
        lg: 'h-12 px-7 text-base has-[>svg]:px-5',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
