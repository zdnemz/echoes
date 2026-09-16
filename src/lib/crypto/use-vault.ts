'use client'

import { useSyncExternalStore } from 'react'
import { onVaultChange, getVault, isUnlocked, lock, ensureKeys, type UnlockedVault } from '@/lib/crypto/vault'

const SERVER_UNLOCKED = false

export function useVaultStatus(): boolean {
  return useSyncExternalStore(
    (l) => onVaultChange(l),
    isUnlocked,
    () => SERVER_UNLOCKED,
  )
}

export function useVault(): UnlockedVault | null {
  useSyncExternalStore(
    (l) => onVaultChange(l),
    isUnlocked,
    () => SERVER_UNLOCKED,
  )
  return getVault()
}

export { lock, ensureKeys, type UnlockedVault }
