'use client'

/**
 * The user chip — avatar initials, quiet dropdown: settings, sign out.
 * Profile editing lives in the settings view; this menu only navigates.
 */

import { GearSix, LockOpen, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/lib/auth/session'
import { initials } from '@/lib/format'
import { lock as lockVault } from '@/lib/crypto/vault'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { View } from './workspace'

export function UserMenu({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { user, logout } = useSession()

  if (!user) return null

  const label = user.display_name || user.email || 'you'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="press flex items-center gap-2.5 border-2 border-foreground bg-background py-1 pl-1 pr-3 transition-colors hover:bg-muted"
        >
          <span
            className="flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[10px] font-black text-background"
            aria-hidden="true"
          >
            {initials(label, '·')}
          </span>
          <span className="hidden max-w-[14ch] truncate text-[12.5px] font-bold sm:inline">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onNavigate({ kind: 'settings' })}>
          <GearSix className="h-3.5 w-3.5" /> Settings
        </DropdownMenuItem>
        {/* The journal is always behind the account PIN; locking drops the
            keys from memory and puts the PIN gate back up. */}
        <DropdownMenuItem onClick={() => lockVault()}>
          <LockOpen className="h-3.5 w-3.5" /> Lock now
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()} variant="destructive">
          <SignOut className="h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
