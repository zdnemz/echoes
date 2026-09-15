import { describe, expect, test } from 'bun:test'
import {
  deriveKekFromPassword,
  generateDataKey,
  generateIdentityKeypair,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  isSealed,
  openEntry,
  openSealedKey,
  openText,
  randomSalt,
  sealEntry,
  sealKeyFor,
  sealText,
  unwrapKey,
  wrapKey,
} from './envelope'

describe('envelope crypto', () => {
  test('password-wrapped DEK round trips; wrong password fails closed', async () => {
    const salt = randomSalt()
    const dek = await generateDataKey()
    const kek = await deriveKekFromPassword('correct horse battery staple', salt)
    const wrapped = await wrapKey(dek, kek)
    await expect(unwrapKey(wrapped, kek)).resolves.toBeTruthy()

    const wrongKek = await deriveKekFromPassword('wrong password', salt)
    await expect(unwrapKey(wrapped, wrongKek)).rejects.toThrow()
  })

  test('sealed text rejects wrong key and tampering', async () => {
    const k = await generateDataKey()
    const sealed = await sealText('the quiet part', k)
    expect(isSealed(sealed)).toBe(true)
    expect(await openText(sealed, k)).toBe('the quiet part')

    const other = await generateDataKey()
    await expect(openText(sealed, other)).rejects.toThrow()

    const [v, b64] = sealed.split('.')
    const flipped = b64.slice(0, 10) + (b64[10] === 'A' ? 'B' : 'A') + b64.slice(11)
    await expect(openText(`${v}.${flipped}`, k)).rejects.toThrow()
  })

  test('entry secret (title+body JSON) round trips', async () => {
    const k = await generateDataKey()
    const sealed = await sealEntry({ title: 'A slow morning', body: 'Coffee was **excellent**.' }, k)
    const opened = await openEntry(sealed, k)
    expect(opened).toEqual({ title: 'A slow morning', body: 'Coffee was **excellent**.' })
  })

  test('ECDH sealed box: owner → member CEK handoff, stranger locked out', async () => {
    const owner = await generateIdentityKeypair()
    const ownerPrivPem = await exportPrivateKey(owner.privateKey)
    const ownerPub = await exportPublicKey(owner.publicKey)
    const member = await generateIdentityKeypair()
    const memberPrivPem = await exportPrivateKey(member.privateKey)
    const memberPub = await exportPublicKey(member.publicKey)

    const cek = await generateDataKey()
    const sealedEntry = await sealEntry({ title: 'group post', body: 'hello circle' }, cek)
    const sealedBox = await sealKeyFor(memberPub, cek, await importPrivateKey(ownerPrivPem), ownerPub)

    const cekForMember = await openSealedKey(sealedBox, await importPrivateKey(memberPrivPem))
    expect(await openEntry(sealedEntry, cekForMember)).toEqual({ title: 'group post', body: 'hello circle' })

    const stranger = await generateIdentityKeypair()
    const strangerPrivPem = await exportPrivateKey(stranger.privateKey)
    await expect(openSealedKey(sealedBox, await importPrivateKey(strangerPrivPem))).rejects.toThrow()
  })
})
