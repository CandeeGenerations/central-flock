import {desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const globalVariablesRouter = Router()

const VAR_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*$/
const RESERVED_NAMES = new Set(['firstName', 'lastName', 'fullName'])

// GET /api/global-variables - List all
globalVariablesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {search} = req.query

    let result = db.select().from(schema.globalVariables).orderBy(desc(schema.globalVariables.updatedAt)).all()

    if (search && typeof search === 'string') {
      const term = search.toLowerCase()
      result = result.filter((v) => v.name.toLowerCase().includes(term) || v.value.toLowerCase().includes(term))
    }

    res.json(result)
  }),
)

// GET /api/global-variables/:id - Get by ID
globalVariablesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const variable = db
      .select()
      .from(schema.globalVariables)
      .where(eq(schema.globalVariables.id, Number(req.params.id)))
      .get()

    if (!variable) {
      res.status(404).json({error: 'Global variable not found'})
      return
    }

    res.json(variable)
  }),
)

// POST /api/global-variables - Create
globalVariablesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {name, value} = req.body as {name: string; value: string}

    if (!name?.trim()) {
      res.status(400).json({error: 'Name is required'})
      return
    }

    if (!VAR_NAME_REGEX.test(name.trim())) {
      res.status(400).json({error: 'Name must be alphanumeric and start with a letter'})
      return
    }

    if (RESERVED_NAMES.has(name.trim())) {
      res.status(400).json({error: `"${name.trim()}" is a reserved variable name`})
      return
    }

    if (value === undefined || value === null) {
      res.status(400).json({error: 'Value is required'})
      return
    }

    const existing = db.select().from(schema.globalVariables).where(eq(schema.globalVariables.name, name.trim())).get()

    if (existing) {
      res.status(409).json({error: `Variable "${name.trim()}" already exists`})
      return
    }

    const variable = db
      .insert(schema.globalVariables)
      .values({
        name: name.trim(),
        value,
      })
      .returning()
      .get()

    res.status(201).json(variable)
  }),
)

// PUT /api/global-variables/:id - Update
globalVariablesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {name, value} = req.body as {name?: string; value?: string}

    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({error: 'Name cannot be empty'})
        return
      }
      if (!VAR_NAME_REGEX.test(name.trim())) {
        res.status(400).json({error: 'Name must be alphanumeric and start with a letter'})
        return
      }
      if (RESERVED_NAMES.has(name.trim())) {
        res.status(400).json({error: `"${name.trim()}" is a reserved variable name`})
        return
      }
    }

    const variable = db
      .update(schema.globalVariables)
      .set({
        ...(name !== undefined ? {name: name.trim()} : {}),
        ...(value !== undefined ? {value} : {}),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.globalVariables.id, id))
      .returning()
      .get()

    if (!variable) {
      res.status(404).json({error: 'Global variable not found'})
      return
    }

    res.json(variable)
  }),
)

// POST /api/global-variables/delete - Bulk delete
globalVariablesRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No variable IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.globalVariables).where(eq(schema.globalVariables.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  }),
)
