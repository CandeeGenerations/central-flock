import type {NextFunction, Request, Response} from 'express'

/**
 * Shared middleware for cgen-api → Central Flock internal webhooks.
 * Validates the X-Internal-Secret header against CENTRAL_FLOCK_INTERNAL_SECRET env var.
 * Reusable for any future cgen-api → Central Flock tool.
 */
export function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.CENTRAL_FLOCK_INTERNAL_SECRET
  if (!expected) {
    res.status(500).json({error: 'internal secret not configured'})
    return
  }
  if (req.header('X-Internal-Secret') !== expected) {
    res.status(401).json({error: 'invalid internal secret'})
    return
  }
  next()
}
