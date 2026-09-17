'use client'

import { useSyncExternalStore } from 'react'
import {
  getKeyState,
  onVaultChange,
  getVault,
  isUnlocked,
  lock,
  ensureKeys,
  type KeyState,
  type UnlockedVault,
} from '@/lib/crypto/vault'

const SERVER_UNLOCKED = false
const SERVER_STATE: KeyState = 'unprovisioned'

export function useVaultStatus(): boolean {
  return useSyncExternalStore(
    (l) => onVaultChange(l),
    isUnlocked,
    () => SERVER_UNLOCKED,
  )
}

export function useKeyState(): KeyState {
  return useSyncExternalStore(
    (l) => onVaultChange(l),
    getKeyState,
    () => SERVER_STATE,
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

export { lock, ensureKeys, type KeyState, type UnlockedVault }
