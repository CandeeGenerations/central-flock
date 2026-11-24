import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {sendNotifyMeText, sendNotifyMeTextWithFallback} from '../services/notify-me.js'
import {createMessage, hasAnthropicKey, requireAnthropicKey} from './anthropic-client.js'
import {withMcpClient} from './mcp-client/client.js'
import {finishSignIn, refreshTokens, startSignIn} from './mcp-client/oauth.js'
import {SandboxBlockedError, assertOutboundAllowed, isSandbox} from './sandbox.js'

// Each outbound client must refuse before it touches the network or the DB. The unit-test DB stub
// throws on any access, and fetch is replaced with a spy, so reaching either fails the test.

// settings.ts reads the DB when imported; notify-me only needs getSetting, which must not be reached.
vi.mock('../routes/settings.js', () => ({
  getSetting: () => {
    throw new Error('getSetting reached in sandbox mode')
  },
}))

const original = process.env.CENTRAL_FLOCK_SANDBOX
const fetchSpy = vi.fn()

beforeEach(() => {
  process.env.CENTRAL_FLOCK_SANDBOX = '1'
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  if (original === undefined) delete process.env.CENTRAL_FLOCK_SANDBOX
  else process.env.CENTRAL_FLOCK_SANDBOX = original
  vi.unstubAllGlobals()
})

describe('isSandbox / assertOutboundAllowed', () => {
  it('is on only for CENTRAL_FLOCK_SANDBOX=1', () => {
    expect(isSandbox()).toBe(true)
    process.env.CENTRAL_FLOCK_SANDBOX = '0'
    expect(isSandbox()).toBe(false)
    delete process.env.CENTRAL_FLOCK_SANDBOX
    expect(isSandbox()).toBe(false)
    expect(() => assertOutboundAllowed('webhook', 'x')).not.toThrow()
  })

  it('throws a SandboxBlockedError naming the kind', () => {
    expect(() => assertOutboundAllowed('mac-bridge', 'sending texts')).toThrow(SandboxBlockedError)
    try {
      assertOutboundAllowed('mac-bridge', 'sending texts')
    } catch (error) {
      expect((error as SandboxBlockedError).kind).toBe('mac-bridge')
    }
  })
})

describe('outbound clients in sandbox mode', () => {
  it('createMessage refuses before calling Claude', async () => {
    await expect(
      createMessage('test', {model: 'x', max_tokens: 1, messages: [{role: 'user', content: 'hi'}]}),
    ).rejects.toBeInstanceOf(SandboxBlockedError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the Claude key checks report AI as off', () => {
    process.env.ANTHROPIC_API_KEY ??= 'sk-test'
    expect(hasAnthropicKey()).toBe(false)
    expect(() => requireAnthropicKey()).toThrow(SandboxBlockedError)
  })

  it('MCP connect, sign-in and token refresh refuse', async () => {
    await expect(withMcpClient('canva', async () => 'unreachable')).rejects.toBeInstanceOf(SandboxBlockedError)
    await expect(startSignIn('canva', 'public')).rejects.toBeInstanceOf(SandboxBlockedError)
    await expect(
      finishSignIn({provider: 'canva', target: 'public', codeVerifier: 'v', createdAt: Date.now()}, 'code'),
    ).rejects.toBeInstanceOf(SandboxBlockedError)
    await expect(refreshTokens('canva')).rejects.toBeInstanceOf(SandboxBlockedError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('notify-me sends nothing and returns false straight away', async () => {
    expect(await sendNotifyMeText('hello')).toBe(false)
    expect(await sendNotifyMeTextWithFallback('hello')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
