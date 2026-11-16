import {randomBytes} from 'node:crypto'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {decryptJson, encryptJson} from './crypto.js'
import {withLock} from './mutex.js'
import {appReturnUrl, callbackUrl} from './oauth.js'

describe('connection secrets encryption', () => {
  const original = process.env.CONNECTIONS_KEY
  beforeEach(() => {
    process.env.CONNECTIONS_KEY = randomBytes(32).toString('base64')
  })
  afterEach(() => {
    process.env.CONNECTIONS_KEY = original
  })

  it('round-trips JSON', () => {
    const value = {tokens: {access_token: 'a', refresh_token: 'r', token_type: 'Bearer', expires_in: 3600}}
    expect(decryptJson(encryptJson(value))).toEqual(value)
  })

  it('never stores plaintext', () => {
    expect(encryptJson({secret: 'super-secret-token'}).toString('utf8')).not.toContain('super-secret-token')
  })

  it('rejects a tampered blob', () => {
    const blob = encryptJson({a: 1})
    blob[blob.length - 1] ^= 0xff
    expect(() => decryptJson(blob)).toThrow()
  })

  it('rejects a different key', () => {
    const blob = encryptJson({a: 1})
    process.env.CONNECTIONS_KEY = randomBytes(32).toString('base64')
    expect(() => decryptJson(blob)).toThrow()
  })

  it('requires a 32-byte key', () => {
    process.env.CONNECTIONS_KEY = randomBytes(16).toString('base64')
    expect(() => encryptJson({})).toThrow(/32 bytes/)
  })
})

describe('withLock', () => {
  it('runs same-key work one at a time, in order', async () => {
    const log: string[] = []
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        log.push(`start ${name}`)
        setTimeout(() => {
          log.push(`end ${name}`)
          resolve(name)
        }, ms)
      })
    const results = await Promise.all([withLock('k', task('a', 20)), withLock('k', task('b', 1))])
    expect(results).toEqual(['a', 'b'])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('keeps going after a failure', async () => {
    const failed = withLock('k2', async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(withLock('k2', async () => 'ok')).resolves.toBe('ok')
  })
})

describe('redirect URLs', () => {
  it('uses the tunnel for public sign-ins and 127.0.0.1 for local ones', () => {
    expect(callbackUrl('canva', 'public')).toBe('https://flock.cgen.cc/api/connections/canva/callback')
    expect(callbackUrl('canva', 'local')).toBe('http://127.0.0.1:5172/api/connections/canva/callback')
  })

  it('returns to Settings with the outcome', () => {
    expect(appReturnUrl('canva', 'public')).toBe('https://flock.cgen.cc/settings?connection=canva')
    expect(appReturnUrl('metricool', 'local', 'access_denied')).toBe(
      'http://127.0.0.1:5173/settings?connection=metricool&connectionError=access_denied',
    )
  })
})
