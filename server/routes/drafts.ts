import {asc, desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {BATCH_DEFAULTS} from '../lib/constants.js'
import {asyncHandler, getGroupName} from '../lib/route-helpers.js'

export const draftsRouter = Router()

// GET /api/drafts - List all drafts
draftsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {search} = req.query

    const draftsList = db
      .select()
      .from(schema.drafts)
      .orderBy(
        sql`CASE WHEN ${schema.drafts.scheduledAt} IS NULL THEN 1 ELSE 0 END`,
        asc(schema.drafts.scheduledAt),
        desc(schema.drafts.updatedAt),
      )
      .all()

    let result = draftsList.map((draft) => {
      let recipientCount = 0
      let excludeCount = 0
      if (draft.excludeIds) {
        try {
          excludeCount = JSON.parse(draft.excludeIds).length
        } catch {
          /* ignore */
        }
      }
      const groupName = draft.groupId ? getGroupName(draft.groupId) : null
      if (draft.groupId) {
        const count = db
          .select({count: sql<number>`count(*)`})
          .from(schema.peopleGroups)
          .where(eq(schema.peopleGroups.groupId, draft.groupId))
          .get()
        recipientCount = Math.max(0, (count?.count || 0) - excludeCount)
      } else if (draft.selectedIndividualIds) {
        try {
          recipientCount = Math.max(0, JSON.parse(draft.selectedIndividualIds).length - excludeCount)
        } catch {
          /* ignore */
        }
      }
      return {...draft, groupName, recipientCount}
    })

    if (search && typeof search === 'string') {
      const term = search.toLowerCase()
      result = result.filter(
        (draft) =>
          draft.content?.toLowerCase().includes(term) ||
          draft.name?.toLowerCase().includes(term) ||
          draft.groupName?.toLowerCase().includes(term),
      )
    }

    res.json(result)
  }),
)

// GET /api/drafts/:id - Get single draft
draftsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const draft = db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, Number(req.params.id)))
      .get()

    if (!draft) {
      res.status(404).json({error: 'Draft not found'})
      return
    }

    const groupName = draft.groupId ? getGroupName(draft.groupId) : null

    res.json({...draft, groupName})
  }),
)

// POST /api/drafts - Create draft
draftsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      name,
      content,
      recipientMode,
      groupId,
      selectedIndividualIds,
      excludeIds,
      batchSize,
      batchDelayMs,
      scheduledAt,
    } = req.body

    const draft = db
      .insert(schema.drafts)
      .values({
        name: name || null,
        content: content || '',
        recipientMode: recipientMode || 'group',
        groupId: groupId || null,
        selectedIndividualIds: selectedIndividualIds || null,
        excludeIds: excludeIds || null,
        batchSize: batchSize ?? BATCH_DEFAULTS.batchSize,
        batchDelayMs: batchDelayMs ?? BATCH_DEFAULTS.batchDelayMs,
        scheduledAt: scheduledAt || null,
      })
      .returning()
      .get()

    res.status(201).json(draft)
  }),
)

// PUT /api/drafts/:id - Update draft
draftsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {
      name,
      content,
      recipientMode,
      groupId,
      selectedIndividualIds,
      excludeIds,
      batchSize,
      batchDelayMs,
      scheduledAt,
    } = req.body

    const draft = db
      .update(schema.drafts)
      .set({
        name: name ?? null,
        content: content ?? '',
        recipientMode: recipientMode ?? 'group',
        groupId: groupId ?? null,
        selectedIndividualIds: selectedIndividualIds ?? null,
        excludeIds: excludeIds ?? null,
        batchSize: batchSize ?? BATCH_DEFAULTS.batchSize,
        batchDelayMs: batchDelayMs ?? BATCH_DEFAULTS.batchDelayMs,
        scheduledAt: scheduledAt ?? null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.drafts.id, id))
      .returning()
      .get()

    if (!draft) {
      res.status(404).json({error: 'Draft not found'})
      return
    }

    res.json(draft)
  }),
)

// POST /api/drafts/:id/duplicate - Duplicate a draft
draftsRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const original = db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, Number(req.params.id)))
      .get()

    if (!original) {
      res.status(404).json({error: 'Draft not found'})
      return
    }

    const copy = db
      .insert(schema.drafts)
      .values({
        name: original.name ? `${original.name} (copy)` : null,
        content: original.content,
        recipientMode: original.recipientMode,
        groupId: original.groupId,
        selectedIndividualIds: original.selectedIndividualIds,
        excludeIds: original.excludeIds,
        batchSize: original.batchSize,
        batchDelayMs: original.batchDelayMs,
      })
      .returning()
      .get()

    res.status(201).json(copy)
  }),
)

// POST /api/drafts/delete - Bulk delete drafts
draftsRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No draft IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.drafts).where(eq(schema.drafts.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  }),
)
