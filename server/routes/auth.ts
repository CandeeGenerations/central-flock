import bcrypt from 'bcryptjs'
import type {Request, Response} from 'express'
import {Router} from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'

import {authEnabled} from '../middleware/auth.js'

export const authRouter = Router()

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {error: 'Too many login attempts. Please try again later.'},
  standardHeaders: true,
  legacyHeaders: false,
})

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)(d|h|m)$/)
  if (!match) return 7 * 24 * 60 * 60 * 1000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  if (unit === 'd') return value * 24 * 60 * 60 * 1000
  if (unit === 'h') return value * 60 * 60 * 1000
  if (unit === 'm') return value * 60 * 1000
  return 7 * 24 * 60 * 60 * 1000
}

authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  if (!authEnabled) {
    res.json({success: true})
    return
  }

  const {password} = req.body
  if (!password || typeof password !== 'string') {
    res.status(400).json({error: 'Password is required'})
    return
  }

  const valid = await bcrypt.compare(password, process.env.AUTH_PASSWORD_HASH!)
  if (!valid) {
    res.status(401).json({error: 'Invalid password'})
    return
  }

  const expiry = process.env.JWT_EXPIRY || '7d'
  const maxAge = parseExpiry(expiry)
  const expiresInSeconds = Math.floor(maxAge / 1000)
  const token = jwt.sign({authenticated: true}, process.env.JWT_SECRET!, {expiresIn: expiresInSeconds})

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    maxAge,
  })
  res.json({success: true})
})

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
  })
  res.json({success: true})
})

authRouter.get('/status', (req: Request, res: Response) => {
  if (!authEnabled) {
    res.json({authRequired: false, authenticated: true})
    return
  }

  let authenticated = false
  const token = req.cookies?.token
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET!)
      authenticated = true
    } catch {
      // invalid token
    }
  }
  res.json({authRequired: true, authenticated})
})
