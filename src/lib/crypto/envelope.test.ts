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

/** Round-trip the whole crypto stack in one binary test. */
const t = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`, err)
    process.exit(1)
  }
}

await t('password-wrapped DEK round trip', async () => {
  const salt = randomSalt()
  const dek = await generateDataKey()
  const kek = await deriveKekFromPassword('correct horse battery staple', salt)
  const wrapped = await wrapKey(dek, kek)
  if (!(await unwrapKey(wrapped, kek))) throw new Error('unwrap returned falsy')
  // Wrong password → GCM auth tag must fail, not return garbage.
  const wrongKek = await deriveKekFromPassword('wrong password', salt)
  let failed = false
  try {
    await unwrapKey(wrapped, wrongKek)
  } catch {
    failed = true
  }
  if (!failed) throw new Error('wrong password unwrapped the key!')
})

await t('text sealing detects tampering + wrong key', async () => {
  const k = await generateDataKey()
  const sealed = await sealText('the quiet part', k)
  if (!isSealed(sealed)) throw new Error('isSealed failed')
  if ((await openText(sealed, k)) !== 'the quiet part') throw new Error('round trip failed')
  const other = await generateDataKey()
  let failed = false
  try {
    await openText(sealed, other)
  } catch {
    failed = true
  }
  if (!failed) throw new Error('wrong key opened the text!')
  // flip one ciphertext byte → auth failure
  const parts = sealed.split('.')
  const bytes = parts[1]
  const flipped = (bytes.slice(0, 10) + (bytes[10] === 'A' ? 'B' : 'A') + bytes.slice(11)) as string
  let tamperFailed = false
  try {
    await openText(`${parts[0]}.${flipped}`, k)
  } catch {
    tamperFailed = true
  }
  if (!tamperFailed) throw new Error('tampered ciphertext opened!')
})

await t('entry secret (title+body JSON) round trip', async () => {
  const k = await generateDataKey()
  const sealed = await sealEntry({ title: 'A slow morning', body: 'Coffee was **excellent**.' }, k)
  const opened = await openEntry(sealed, k)
  if (opened.title !== 'A slow morning' || opened.body !== 'Coffee was **excellent**.') {
    throw new Error('entry secret mismatch')
  }
})

await t('ECDH sealed box: owner → member CEK handoff', async () => {
  // Owner identity
  const owner = await generateIdentityKeypair()
  const ownerPrivPem = await exportPrivateKey(owner.privateKey)
  const ownerPub = await exportPublicKey(owner.publicKey)
  // Member identity
  const member = await generateIdentityKeypair()
  const memberPrivPem = await exportPrivateKey(member.privateKey)
  const memberPub = await exportPublicKey(member.publicKey)
  // Group CEK + entry sealed under it
  const cek = await generateDataKey()
  const sealedEntry = await sealEntry({ title: 'group post', body: 'hello circle' }, cek)
  // Owner seals the CEK for the member
  const sealedBox = await sealKeyFor(memberPub, cek, await importPrivateKey(ownerPrivPem), ownerPub)
  // Member opens the box and then the entry
  const cekForMember = await openSealedKey(sealedBox, await importPrivateKey(memberPrivPem))
  const opened = await openEntry(sealedEntry, cekForMember)
  if (opened.title !== 'group post' || opened.body !== 'hello circle') throw new Error('sealed box handoff failed')
  // A third party (no keys) must not be able to open the box
  const stranger = await generateIdentityKeypair()
  const strangerPrivPem = await exportPrivateKey(stranger.privateKey)
  let failed = false
  try {
    await openSealedKey(sealedBox, await importPrivateKey(strangerPrivPem))
  } catch {
    failed = true
  }
  if (!failed) throw new Error('stranger opened the sealed box!')
})

console.log('\nALL ENVELOPE CRYPTO TESTS PASSED')
