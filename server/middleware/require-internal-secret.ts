import type {NextFunction, Request, Response} from 'express'
import rateLimit from 'express-rate-limit'
import {createHash, timingSafeEqual} from 'node:crypto'

/**
 * Shared middleware for cgen-api → Central Flock internal webhooks.
 * Validates the X-Internal-Secret header against CENTRAL_FLOCK_INTERNAL_SECRET env var.
 * Reusable for any future cgen-api → Central Flock tool.
 *
 * Once Central Flock is hosted off the Mac, /webhooks is reachable from the internet and this
 * secret is its only guard (ADR 0043), so the comparison is constant-time.
 */
export function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.CENTRAL_FLOCK_INTERNAL_SECRET
  if (!expected) {
    res.status(500).json({error: 'internal secret not configured'})
    return
  }
  if (!secretMatches(req.header('X-Internal-Secret'), expected)) {
    res.status(401).json({error: 'invalid internal secret'})
    return
  }
  next()
}

// Hashing first gives both sides the same length, which timingSafeEqual requires, without
// leaking the expected secret's length through an early return.
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// The only caller is cgen-api, so every request shares one bucket rather than being keyed by IP
// (which behind Cloudflare and a host's proxy would be the proxy's address anyway). cgen-api
// limits its own routes to 60/min overall; this sits above that.
export const webhooksRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: () => 'webhooks',
  validate: {xForwardedForHeader: false},
  message: {error: 'Too many webhook requests'},
})
