import {desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const templatesRouter = Router()

// GET /api/templates - List all templates
templatesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {search} = req.query

    let result = db.select().from(schema.templates).orderBy(desc(schema.templates.updatedAt)).all()

    if (search && typeof search === 'string') {
      const term = search.toLowerCase()
      result = result.filter(
        (t) => t.name.toLowerCase().includes(term) || t.content.toLowerCase().includes(term),
      )
    }

    res.json(result)
  }),
)

// GET /api/templates/:id - Get single template
templatesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, Number(req.params.id)))
      .get()

    if (!template) {
      res.status(404).json({error: 'Template not found'})
      return
    }

    res.json(template)
  }),
)

// POST /api/templates - Create template
templatesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {name, content, customVariables} = req.body as {
      name: string
      content?: string
      customVariables?: string
    }

    if (!name?.trim()) {
      res.status(400).json({error: 'Name is required'})
      return
    }

    const template = db
      .insert(schema.templates)
      .values({
        name: name.trim(),
        content: content || '',
        customVariables: customVariables || null,
      })
      .returning()
      .get()

    res.status(201).json(template)
  }),
)

// PUT /api/templates/:id - Update template
templatesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {name, content, customVariables} = req.body as {
      name?: string
      content?: string
      customVariables?: string
    }

    const template = db
      .update(schema.templates)
      .set({
        ...(name !== undefined ? {name: name.trim()} : {}),
        ...(content !== undefined ? {content} : {}),
        ...(customVariables !== undefined ? {customVariables: customVariables || null} : {}),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.templates.id, id))
      .returning()
      .get()

    if (!template) {
      res.status(404).json({error: 'Template not found'})
      return
    }

    res.json(template)
  }),
)

// POST /api/templates/delete - Bulk delete templates
templatesRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No template IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.templates).where(eq(schema.templates.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  }),
)
