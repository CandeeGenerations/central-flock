import {format} from 'date-fns'
import {asc, desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {BATCH_DEFAULTS} from '../lib/constants.js'
import {renderTemplate} from '../lib/format.js'
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
      // Compute rendered preview
      let renderedPreview: string | null = null
      if (draft.content) {
        // Resolve template variables
        const globals = db.select().from(schema.globalVariables).all()
        const varValues: Record<string, string> = Object.fromEntries(globals.map((g) => [g.name, g.value]))
        if (draft.templateState) {
          try {
            const ts = JSON.parse(draft.templateState) as {
              customVarValues?: Record<string, string>
              dateValues?: Record<string, string>
              dateFormats?: Record<string, string>
            }
            if (ts.customVarValues) Object.assign(varValues, ts.customVarValues)
            if (ts.dateValues && ts.dateFormats) {
              for (const [key, iso] of Object.entries(ts.dateValues)) {
                if (iso) {
                  const fmt = ts.dateFormats[key] || 'MMMM d, yyyy'
                  varValues[key] = format(new Date(iso), fmt)
                }
              }
            }
          } catch {
            /* ignore */
          }
        }
        // Get a sample recipient
        let samplePerson: {firstName: string | null; lastName: string | null} = {firstName: null, lastName: null}
        if (draft.groupId) {
          const member = db
            .select({firstName: schema.people.firstName, lastName: schema.people.lastName})
            .from(schema.peopleGroups)
            .innerJoin(schema.people, eq(schema.peopleGroups.personId, schema.people.id))
            .where(eq(schema.peopleGroups.groupId, draft.groupId))
            .limit(1)
            .get()
          if (member) samplePerson = member
        } else if (draft.selectedIndividualIds) {
          try {
            const ids: number[] = JSON.parse(draft.selectedIndividualIds)
            if (ids.length > 0) {
              const person = db
                .select({firstName: schema.people.firstName, lastName: schema.people.lastName})
                .from(schema.people)
                .where(eq(schema.people.id, ids[0]))
                .get()
              if (person) samplePerson = person
            }
          } catch {
            /* ignore */
          }
        }
        renderedPreview = renderTemplate(draft.content, samplePerson, varValues)
      }

      return {...draft, groupName, recipientCount, renderedPreview}
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
      templateState,
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
        templateState: templateState || null,
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
      templateState,
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
        templateState: templateState ?? null,
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
        templateState: original.templateState,
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
