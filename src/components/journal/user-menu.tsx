'use client'

/**
 * The user chip — avatar initials, quiet dropdown: edit display name,
 * sign out. Profile edits PATCH /api/auth/profile directly.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, PencilSimple, SignOut } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from '@/lib/auth/session'
import { updateProfile } from '@/lib/api/endpoints'
import { avatarTone, initials } from '@/lib/format'

export function UserMenu() {
  const { user, logout, refresh } = useSession()
  const [profileOpen, setProfileOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profileOpen) setName(user?.display_name ?? '')
  }, [profileOpen, user])

  if (!user) return null

  const tone = avatarTone(user.id)
  const label = user.display_name || user.email || 'you'

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return toast.error('A name — even a pen name — is needed.')
    setBusy(true)
    try {
      await updateProfile(n)
      await refresh()
      toast.success("That's the name shared notebooks will use.")
      setProfileOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account"
            className="press flex items-center gap-2.5 rounded-full border border-line bg-paper-raised py-1 pl-1 pr-3 transition-colors hover:border-clay-soft"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
              style={{ background: tone.bg, color: tone.fg }}
              aria-hidden="true"
            >
              {initials(label, '·')}
            </span>
            <span className="hidden max-w-[14ch] truncate text-[12.5px] text-ink-soft sm:inline">{label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 border-line bg-paper-raised">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setProfileOpen(true)} className="gap-2 text-[13px]">
            <PencilSimple className="h-3.5 w-3.5" /> Display name
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-line" />
          <DropdownMenuItem onClick={() => logout()} className="gap-2 text-[13px] text-ember focus:text-ember">
            <SignOut className="h-3.5 w-3.5" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm border-line bg-paper-raised">
          <DialogHeader>
            <DialogTitle className="font-display text-lg text-ink">Your display name</DialogTitle>
            <DialogDescription className="text-[12.5px] text-ink-soft">
              What shared notebooks call you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveProfile} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name" className="text-[12.5px]">
                Name
              </Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={80}
                className="h-10 bg-paper"
              />
            </div>
            <DialogFooter className="mt-1 gap-2">
              <Button type="button" variant="ghost" onClick={() => setProfileOpen(false)} className="press h-9">
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="press h-9 gap-1.5 shadow-ink">
                {busy ? (
                  <Check weight="bold" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check weight="bold" className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
