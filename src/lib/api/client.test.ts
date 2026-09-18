import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { api, ApiError, isNetworkDrop } from './client'

/**
 * The offline guard is the difference between an app that serves its cached
 * journal instantly and one that stalls on a screen full of spinning fetches:
 * while offline, every poll, query and session restore funnels through here.
 * These confirm the guard fires on an explicit offline signal, stays out of
 * the way when online (or when the runtime has no opinion), and that the
 * error it produces is the NETWORK drop the outbox and fallbacks key off.
 */

const fetchMock = mock((_url: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }))),
)

// Save the real globals: this runner shares a process with other test files,
// so a leaked mock fetch (always { ok: true }) or a deleted navigator breaks
// their expectations. Everything is restored in afterAll.
const realFetch = globalThis.fetch
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

beforeAll(() => {
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
})
beforeEach(() => {
  fetchMock.mockClear()
})
afterAll(() => {
  globalThis.fetch = realFetch
  fetchMock.mockRestore()
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
  else delete (globalThis as { navigator?: unknown }).navigator
})

function setOnline(onLine: boolean | undefined) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine },
    configurable: true,
    writable: true,
  })
}

describe('offline guard', () => {
  test('offline throws a NETWORK drop without touching the network', async () => {
    setOnline(false)
    await expect(api('/api/health')).rejects.toThrow('Could not reach the server')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the offline error is the drop the outbox and fallbacks key off', async () => {
    setOnline(false)
    await expect(api('/api/notebooks')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
    })
    const err = await api('/api/notebooks').catch((e) => e)
    expect(isNetworkDrop(err)).toBe(true)
  })

  test('online issues the fetch as normal', async () => {
    setOnline(true)
    await api('/api/health')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a runtime with no onLine opinion is treated as online', async () => {
    // Bun and the e2e scripts expose navigator without onLine.
    setOnline(undefined)
    await api('/api/health')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test(
    'a fetch that never settles becomes a NETWORK drop, not a hang',
    async () => {
      // The real reason this matters: turning wifi off often leaves
      // navigator.onLine true, so the guard above is skipped and the request
      // sits on a dead socket. Every offline path — the vault's key-state
      // resolve, an offline write reaching the outbox — keys off a prompt
      // NETWORK error.
      setOnline(true)
      fetchMock.mockImplementationOnce(
        (_url, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            )
          }),
      )
      const started = Date.now()
      const err = await api('/api/notebooks').catch((e) => e)
      expect(isNetworkDrop(err)).toBe(true)
      // Bounded by the client's own deadline, not the (never-arriving) response.
      expect(Date.now() - started).toBeLessThan(15_000)
    },
    { timeout: 15_000 },
  )

  test('a caller-supplied abort stays a cancellation, not a NETWORK drop', async () => {
    setOnline(true)
    const controller = new AbortController()
    fetchMock.mockImplementationOnce(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    const p = api('/api/notebooks', { signal: controller.signal }).catch((e) => e)
    controller.abort()
    const err = await p
    expect(err).toBeInstanceOf(DOMException)
    expect(isNetworkDrop(err)).toBe(false)
  })
})
