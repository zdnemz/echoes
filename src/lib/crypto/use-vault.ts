'use client'

/**
 * useVault — React binding over the key vault.
 *
 * Components ask two questions: "is the vault unlocked?" and "give me the
 * key that decrypts this entry". The hook re-renders on lock/unlock
 * transitions; key resolution goes through resolveEntryKey.
 */

import { useSyncExternalStore } from 'react'
import {
  onVaultChange,
  getVault,
  isUnlocked,
  lock,
  unlock,
  tryAutoUnlock,
  type UnlockedVault,
} from '@/lib/crypto/vault'

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

export { lock, unlock, tryAutoUnlock, type UnlockedVault }
