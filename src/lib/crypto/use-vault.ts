'use client'

import { useSyncExternalStore } from 'react'
import { onVaultChange, getVault, isUnlocked, lock, ensureKeys, type UnlockedVault } from '@/lib/crypto/vault'
import { getAppLockMethods, onAppLockChange } from '@/lib/crypto/app-lock'

const SERVER_UNLOCKED = false
const SERVER_METHODS = { pin: false, passkey: false }

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

/**
 * The journal is behind the lock screen: a lock method is configured and the
 * vault currently holds no keys. Both inputs are subscribed, so unlocking (or
 * enabling/disabling a method) re-renders immediately.
 */
export function useAppLockLocked(): boolean {
  const unlocked = useVaultStatus()
  const methods = useSyncExternalStore(
    (l) => onAppLockChange(l),
    getAppLockMethods,
    () => SERVER_METHODS,
  )
  return (methods.pin || methods.passkey) && !unlocked
}

export { lock, ensureKeys, type UnlockedVault }
