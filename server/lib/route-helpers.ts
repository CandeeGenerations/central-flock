import * as Sentry from '@sentry/node'
import {eq, inArray} from 'drizzle-orm'
import type {Request, Response} from 'express'

import {db, schema} from '../db/index.js'

export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((error) => {
      Sentry.captureException(error)
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

// Batched lookup that preserves input order and skips ids whose group has been deleted.
export function getGroupNames(ids: number[]): string[] {
  if (ids.length === 0) return []
  const rows = db
    .select({id: schema.groups.id, name: schema.groups.name})
    .from(schema.groups)
    .where(inArray(schema.groups.id, ids))
    .all()
  const map = new Map(rows.map((r) => [r.id, r.name]))
  return ids.map((id) => map.get(id)).filter((n): n is string => !!n)
}

export function getMessageGroupIds(messageId: number): number[] {
  return db
    .select({groupId: schema.messageGroups.groupId})
    .from(schema.messageGroups)
    .where(eq(schema.messageGroups.messageId, messageId))
    .all()
    .map((r) => r.groupId)
}

export function getDraftGroupIds(draftId: number): number[] {
  return db
    .select({groupId: schema.draftGroups.groupId})
    .from(schema.draftGroups)
    .where(eq(schema.draftGroups.draftId, draftId))
    .all()
    .map((r) => r.groupId)
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint')
}
