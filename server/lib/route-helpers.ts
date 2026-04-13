import {eq} from 'drizzle-orm'
import type {Request, Response} from 'express'

import {db, schema} from '../db/index.js'

export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((error) => {
      console.error('Unhandled route error:', error)
      const message = parseErrorMessage(error)
      res.status(500).json({error: message})
    })
  }
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Internal server error'
  const msg = error.message
  // Anthropic SDK errors: "529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},...}"
  const jsonStart = msg.indexOf('{')
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(msg.slice(jsonStart))
      if (parsed?.error?.message) return parsed.error.message
    } catch {
      /* not JSON, fall through */
    }
  }
  return msg
}

export function getGroupName(groupId: number): string | null {
  const group = db.select({name: schema.groups.name}).from(schema.groups).where(eq(schema.groups.id, groupId)).get()
  return group?.name || null
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint')
}
