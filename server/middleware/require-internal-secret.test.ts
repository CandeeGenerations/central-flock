import type {NextFunction, Request, Response} from 'express'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {requireInternalSecret, secretMatches} from './require-internal-secret.js'

function run(header: string | undefined) {
  const req = {header: (name: string) => (name === 'X-Internal-Secret' ? header : undefined)} as Request
  const res = {status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis()}
  const next = vi.fn() as NextFunction
  requireInternalSecret(req, res as unknown as Response, next)
  return {res, next}
}

describe('secretMatches', () => {
  it('matches the same secret', () => {
    expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('rejects a different secret, a prefix, and a missing header', () => {
    expect(secretMatches('s3cret-valuE', 's3cret-value')).toBe(false)
    expect(secretMatches('s3cret', 's3cret-value')).toBe(false)
    expect(secretMatches(undefined, 's3cret-value')).toBe(false)
  })
})

describe('requireInternalSecret', () => {
  const original = process.env.CENTRAL_FLOCK_INTERNAL_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.CENTRAL_FLOCK_INTERNAL_SECRET
    else process.env.CENTRAL_FLOCK_INTERNAL_SECRET = original
  })

  it('passes a request with the right secret', () => {
    process.env.CENTRAL_FLOCK_INTERNAL_SECRET = 'right'
    const {res, next} = run('right')
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('answers 401 for a wrong or missing secret', () => {
    process.env.CENTRAL_FLOCK_INTERNAL_SECRET = 'right'
    for (const header of ['wrong', undefined]) {
      const {res, next} = run(header)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })

  it('answers 500 when no secret is configured', () => {
    delete process.env.CENTRAL_FLOCK_INTERNAL_SECRET
    const {res, next} = run('anything')
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
