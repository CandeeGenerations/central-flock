import {desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'

export const draftsRouter = Router()

// GET /api/drafts - List all drafts
draftsRouter.get('/', async (_req, res) => {
  try {
    const draftsList = db.select().from(schema.drafts).orderBy(desc(schema.drafts.updatedAt)).all()

    const result = draftsList.map((draft) => {
      let groupName = null
      let recipientCount = 0
      let excludeCount = 0
      if (draft.excludeIds) {
        try {
          excludeCount = JSON.parse(draft.excludeIds).length
        } catch {
          /* ignore */
        }
      }
      if (draft.groupId) {
        const group = db
          .select({name: schema.groups.name})
          .from(schema.groups)
          .where(eq(schema.groups.id, draft.groupId))
          .get()
        groupName = group?.name || null
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

    res.json(result)
  } catch (error) {
    console.error('Error fetching drafts:', error)
    res.status(500).json({error: 'Failed to fetch drafts'})
  }
})

// GET /api/drafts/:id - Get single draft
draftsRouter.get('/:id', async (req, res) => {
  try {
    const draft = db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, Number(req.params.id)))
      .get()

    if (!draft) {
      res.status(404).json({error: 'Draft not found'})
      return
    }

    let groupName = null
    if (draft.groupId) {
      const group = db
        .select({name: schema.groups.name})
        .from(schema.groups)
        .where(eq(schema.groups.id, draft.groupId))
        .get()
      groupName = group?.name || null
    }

    res.json({...draft, groupName})
  } catch (error) {
    console.error('Error fetching draft:', error)
    res.status(500).json({error: 'Failed to fetch draft'})
  }
})

// POST /api/drafts - Create draft
draftsRouter.post('/', async (req, res) => {
  try {
    const {name, content, recipientMode, groupId, selectedIndividualIds, excludeIds, batchSize, batchDelayMs} = req.body

    const draft = db
      .insert(schema.drafts)
      .values({
        name: name || null,
        content: content || '',
        recipientMode: recipientMode || 'group',
        groupId: groupId || null,
        selectedIndividualIds: selectedIndividualIds || null,
        excludeIds: excludeIds || null,
        batchSize: batchSize ?? 1,
        batchDelayMs: batchDelayMs ?? 5000,
      })
      .returning()
      .get()

    res.status(201).json(draft)
  } catch (error) {
    console.error('Error creating draft:', error)
    res.status(500).json({error: 'Failed to create draft'})
  }
})

// PUT /api/drafts/:id - Update draft
draftsRouter.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const {name, content, recipientMode, groupId, selectedIndividualIds, excludeIds, batchSize, batchDelayMs} = req.body

    const draft = db
      .update(schema.drafts)
      .set({
        name: name ?? null,
        content: content ?? '',
        recipientMode: recipientMode ?? 'group',
        groupId: groupId ?? null,
        selectedIndividualIds: selectedIndividualIds ?? null,
        excludeIds: excludeIds ?? null,
        batchSize: batchSize ?? 1,
        batchDelayMs: batchDelayMs ?? 5000,
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
  } catch (error) {
    console.error('Error updating draft:', error)
    res.status(500).json({error: 'Failed to update draft'})
  }
})

// POST /api/drafts/:id/duplicate - Duplicate a draft
draftsRouter.post('/:id/duplicate', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error duplicating draft:', error)
    res.status(500).json({error: 'Failed to duplicate draft'})
  }
})

// POST /api/drafts/delete - Bulk delete drafts
draftsRouter.post('/delete', async (req, res) => {
  try {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No draft IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.drafts).where(eq(schema.drafts.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  } catch (error) {
    console.error('Error deleting drafts:', error)
    res.status(500).json({error: 'Failed to delete drafts'})
  }
})
