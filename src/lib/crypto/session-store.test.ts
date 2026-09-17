import { describe, expect, test } from 'bun:test'
import { clearSessionKek, loadSessionKek, saveSessionKek } from './session-store'

describe('session-store without IndexedDB (server/tests)', () => {
  test('save/load/clear degrade to a missing remember slot', async () => {
    expect(typeof indexedDB).toBe('undefined')
    await saveSessionKek({} as CryptoKey, 1000)
    expect(await loadSessionKek()).toBeNull()
    await clearSessionKek()
    expect(await loadSessionKek()).toBeNull()
  })
})
