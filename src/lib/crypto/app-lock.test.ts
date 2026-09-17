import { describe, expect, test } from 'bun:test'
import {
  deriveKekFromPassword,
  exportPrivateKey,
  generateDataKey,
  generateIdentityKeypair,
  importPrivateKey,
  openEntry,
  openText,
  randomSalt,
  sealEntry,
  sealText,
  unwrapKey,
  wrapKey,
} from './envelope'

/**
 * The app-lock wrap/unwrap composition (see app-lock.ts): a digit PIN derives
 * the KEK, the DEK is wrapped and the identity private key sealed as text
 * under it, and the same PIN must restore keys that still read existing
 * entries — while a wrong PIN fails closed. Runs against the same exports
 * app-lock composes, so no IndexedDB is needed.
 */
describe('app lock composition', () => {
  async function lockUnderPin(pin: string) {
    const salt = randomSalt()
    const dek = await generateDataKey()
    const identity = await generateIdentityKeypair()
    const kek = await deriveKekFromPassword(pin, salt)
    return {
      salt,
      sealed: await sealEntry({ title: 'locked away', body: 'unread without the pin' }, dek),
      wrappedDek: await wrapKey(dek, kek),
      wrappedIdentity: await sealText(await exportPrivateKey(identity.privateKey), kek),
    }
  }

  test('PIN round trip restores keys that read existing entries', async () => {
    const locked = await lockUnderPin('482917')
    const kek = await deriveKekFromPassword('482917', locked.salt)
    const dek = await unwrapKey(locked.wrappedDek, kek)
    const identity = await importPrivateKey(await openText(locked.wrappedIdentity, kek))

    expect(dek instanceof CryptoKey).toBe(true)
    expect(identity instanceof CryptoKey).toBe(true)
    expect(await openEntry(locked.sealed, dek)).toEqual({
      title: 'locked away',
      body: 'unread without the pin',
    })
  })

  test('wrong PIN fails closed on both the DEK and the identity', async () => {
    const locked = await lockUnderPin('482917')
    const wrong = await deriveKekFromPassword('000000', locked.salt)
    await expect(unwrapKey(locked.wrappedDek, wrong)).rejects.toThrow()
    await expect(openText(locked.wrappedIdentity, wrong)).rejects.toThrow()
  })
})
