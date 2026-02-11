import type {Request, Response} from 'express'

import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((error) => {
      console.error('Unhandled route error:', error)
      res.status(500).json({error: 'Internal server error'})
    })
  }
}

export function getGroupName(groupId: number): string | null {
  const group = db
    .select({name: schema.groups.name})
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId))
    .get()
  return group?.name || null
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint')
}
