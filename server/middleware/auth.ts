import type {NextFunction, Request, Response} from 'express'
import jwt from 'jsonwebtoken'

export const authEnabled = !!process.env.AUTH_PASSWORD_HASH && !!process.env.JWT_SECRET

function isValidApiKey(req: Request): boolean {
  const apiKey = process.env.API_KEY
  if (!apiKey) return false
  const header = req.headers['x-api-key']
  return typeof header === 'string' && header === apiKey
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled) return next()

  if (isValidApiKey(req)) return next()

  const token = req.cookies?.token
  if (!token) {
    res.status(401).json({error: 'Unauthorized'})
    return
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET!)
    next()
  } catch {
    res.status(401).json({error: 'Unauthorized'})
  }
}
