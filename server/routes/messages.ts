import {desc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {BATCH_DEFAULTS} from '../lib/constants.js'
import {renderTemplate} from '../lib/format.js'
import {asyncHandler, getGroupName} from '../lib/route-helpers.js'
import {sendMessage} from '../services/applescript.js'
import {type SendJob, cancelJob, createJob, getJob} from '../services/message-queue.js'

export const messagesRouter = Router()

// POST /api/messages/send - Send message
messagesRouter.post(
  '/send',
  asyncHandler(async (req, res) => {
    const {
      content,
      recipientIds,
      excludeIds = [],
      groupId,
      batchSize = BATCH_DEFAULTS.batchSize,
      batchDelayMs = BATCH_DEFAULTS.batchDelayMs,
      customVarValues,
      scheduledAt,
      templateState,
    } = req.body as {
      content: string
      recipientIds: number[]
      excludeIds?: number[]
      groupId?: number
      batchSize?: number
      batchDelayMs?: number
      customVarValues?: Record<string, string>
      scheduledAt?: string
      templateState?: string
    }

    // Fetch global variables and merge with custom var values (custom takes precedence)
    const globals = db.select().from(schema.globalVariables).all()
    const globalVarValues = Object.fromEntries(globals.map((g) => [g.name, g.value]))
    const mergedVarValues = {...globalVarValues, ...customVarValues}

    // Get all recipients
    const recipients = db
      .select()
      .from(schema.people)
      .where(
        sql`${schema.people.id} IN (${sql.join(
          recipientIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .all()

    const excludeSet = new Set(excludeIds)
    const activeRecipients = recipients.filter((r) => !excludeSet.has(r.id) && r.status === 'active')
    const skippedRecipients = recipients.filter((r) => excludeSet.has(r.id) || r.status !== 'active')

    // Determine if this is a scheduled send
    let scheduledAtUtc: string | null = null
    let isScheduled = false
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt)
      if (scheduledDate.getTime() <= Date.now()) {
        res.status(400).json({error: 'Scheduled time must be in the future'})
        return
      }
      isScheduled = true
      scheduledAtUtc = scheduledDate.toISOString().replace('T', ' ').slice(0, 19)
    }

    // Create message record
    const message = db
      .insert(schema.messages)
      .values({
        content,
        renderedPreview: renderTemplate(content, activeRecipients[0] || recipients[0], mergedVarValues),
        groupId: groupId || null,
        totalRecipients: activeRecipients.length,
        skippedCount: skippedRecipients.length,
        status: isScheduled ? 'scheduled' : 'pending',
        batchSize,
        batchDelayMs,
        scheduledAt: scheduledAtUtc,
        templateState: templateState || null,
      })
      .returning()
      .get()

    // Create recipient records
    for (const person of activeRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId: message.id,
          personId: person.id,
          renderedContent: renderTemplate(content, person, mergedVarValues),
          status: 'pending',
        })
        .run()
    }

    for (const person of skippedRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId: message.id,
          personId: person.id,
          renderedContent: renderTemplate(content, person, mergedVarValues),
          status: 'skipped',
        })
        .run()
    }

    if (isScheduled) {
      // Scheduled — don't send now, just return
      res.status(201).json({messageId: message.id, scheduled: true})
    } else {
      // Immediate send
      const job = createJob(message.id, batchSize, batchDelayMs)
      processSendJob(job)
      res.status(201).json({messageId: message.id, jobId: job.id})
    }
  }),
)

// POST /api/messages/delete - Delete messages by IDs
messagesRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No message IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.messages).where(eq(schema.messages.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  }),
)

// GET /api/messages - Message history
messagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {search} = req.query

    const messagesList = db.select().from(schema.messages).orderBy(desc(schema.messages.createdAt)).all()

    // Attach group names
    let result = messagesList.map((msg) => {
      const groupName = msg.groupId ? getGroupName(msg.groupId) : null
      return {...msg, groupName}
    })

    if (search && typeof search === 'string') {
      const term = search.toLowerCase()
      result = result.filter(
        (msg) =>
          msg.content.toLowerCase().includes(term) ||
          msg.groupName?.toLowerCase().includes(term) ||
          msg.status.toLowerCase().includes(term),
      )
    }

    res.json(result)
  }),
)

// GET /api/messages/:id - Message detail
messagesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const message = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, Number(req.params.id)))
      .get()
    if (!message) {
      res.status(404).json({error: 'Message not found'})
      return
    }

    const recipients = db
      .select({
        id: schema.messageRecipients.id,
        personId: schema.messageRecipients.personId,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        phoneDisplay: schema.people.phoneDisplay,
        renderedContent: schema.messageRecipients.renderedContent,
        status: schema.messageRecipients.status,
        errorMessage: schema.messageRecipients.errorMessage,
        sentAt: schema.messageRecipients.sentAt,
      })
      .from(schema.messageRecipients)
      .innerJoin(schema.people, eq(schema.messageRecipients.personId, schema.people.id))
      .where(eq(schema.messageRecipients.messageId, message.id))
      .all()

    const groupName = message.groupId ? getGroupName(message.groupId) : null

    res.json({...message, groupName, recipients})
  }),
)

// GET /api/messages/:id/status - Poll send progress
messagesRouter.get(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const message = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, Number(req.params.id)))
      .get()
    if (!message) {
      res.status(404).json({error: 'Message not found'})
      return
    }

    const job = getJob(message.id)

    res.json({
      status: message.status,
      sentCount: message.sentCount,
      failedCount: message.failedCount,
      skippedCount: message.skippedCount,
      totalRecipients: message.totalRecipients,
      isProcessing: job?.status === 'processing',
    })
  }),
)

// PUT /api/messages/:id - Edit a scheduled/past_due message
messagesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const messageId = Number(req.params.id)
    const message = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get()

    if (!message) {
      res.status(404).json({error: 'Message not found'})
      return
    }
    if (message.status !== 'scheduled' && message.status !== 'past_due') {
      res.status(400).json({error: 'Only scheduled or past due messages can be edited'})
      return
    }

    const {
      content,
      recipientIds,
      excludeIds = [],
      groupId,
      batchSize = BATCH_DEFAULTS.batchSize,
      batchDelayMs = BATCH_DEFAULTS.batchDelayMs,
      customVarValues,
      scheduledAt,
      templateState,
    } = req.body as {
      content: string
      recipientIds: number[]
      excludeIds?: number[]
      groupId?: number
      batchSize?: number
      batchDelayMs?: number
      customVarValues?: Record<string, string>
      scheduledAt?: string
      templateState?: string
    }

    // Fetch global variables and merge with custom var values
    const globals = db.select().from(schema.globalVariables).all()
    const globalVarValues = Object.fromEntries(globals.map((g) => [g.name, g.value]))
    const mergedVarValues = {...globalVarValues, ...customVarValues}

    // Get all recipients
    const recipients = db
      .select()
      .from(schema.people)
      .where(
        sql`${schema.people.id} IN (${sql.join(
          recipientIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .all()

    const excludeSet = new Set(excludeIds)
    const activeRecipients = recipients.filter((r) => !excludeSet.has(r.id) && r.status === 'active')
    const skippedRecipients = recipients.filter((r) => excludeSet.has(r.id) || r.status !== 'active')

    // Determine if this is a scheduled send
    let scheduledAtUtc: string | null = null
    let isScheduled = false
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt)
      if (scheduledDate.getTime() <= Date.now()) {
        res.status(400).json({error: 'Scheduled time must be in the future'})
        return
      }
      isScheduled = true
      scheduledAtUtc = scheduledDate.toISOString().replace('T', ' ').slice(0, 19)
    }

    // Update message record
    db.update(schema.messages)
      .set({
        content,
        renderedPreview: renderTemplate(content, activeRecipients[0] || recipients[0], mergedVarValues),
        groupId: groupId || null,
        totalRecipients: activeRecipients.length,
        skippedCount: skippedRecipients.length,
        sentCount: 0,
        failedCount: 0,
        status: isScheduled ? 'scheduled' : 'pending',
        batchSize,
        batchDelayMs,
        scheduledAt: scheduledAtUtc,
        templateState: templateState || null,
        completedAt: null,
      })
      .where(eq(schema.messages.id, messageId))
      .run()

    // Delete existing recipients and recreate
    db.delete(schema.messageRecipients).where(eq(schema.messageRecipients.messageId, messageId)).run()

    for (const person of activeRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId,
          personId: person.id,
          renderedContent: renderTemplate(content, person, mergedVarValues),
          status: 'pending',
        })
        .run()
    }

    for (const person of skippedRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId,
          personId: person.id,
          renderedContent: renderTemplate(content, person, mergedVarValues),
          status: 'skipped',
        })
        .run()
    }

    if (!isScheduled) {
      // Immediate send
      const job = createJob(messageId, batchSize, batchDelayMs)
      processSendJob(job)
      res.json({messageId, jobId: job.id})
    } else {
      res.json({messageId, scheduled: true})
    }
  }),
)

// POST /api/messages/:id/cancel - Cancel in-progress batch
messagesRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const messageId = Number(req.params.id)
    const message = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get()

    if (!message) {
      res.status(404).json({error: 'Message not found'})
      return
    }

    // For scheduled/past_due messages, convert back to a draft
    if (message.status === 'scheduled' || message.status === 'past_due') {
      // Gather recipient IDs to reconstruct the draft
      const recipients = db
        .select({personId: schema.messageRecipients.personId, status: schema.messageRecipients.status})
        .from(schema.messageRecipients)
        .where(eq(schema.messageRecipients.messageId, messageId))
        .all()

      const excludeIds = recipients.filter((r) => r.status === 'skipped').map((r) => r.personId)
      const selectedIndividualIds = recipients.filter((r) => r.status !== 'skipped').map((r) => r.personId)

      const draft = db
        .insert(schema.drafts)
        .values({
          content: message.content,
          recipientMode: message.groupId ? 'group' : 'individual',
          groupId: message.groupId,
          selectedIndividualIds: message.groupId ? null : JSON.stringify(selectedIndividualIds),
          excludeIds: excludeIds.length > 0 ? JSON.stringify(excludeIds) : null,
          batchSize: message.batchSize,
          batchDelayMs: message.batchDelayMs,
          scheduledAt: message.scheduledAt,
          templateState: message.templateState,
        })
        .returning()
        .get()

      // Delete the message and its recipients
      db.delete(schema.messageRecipients).where(eq(schema.messageRecipients.messageId, messageId)).run()
      db.delete(schema.messages).where(eq(schema.messages.id, messageId)).run()

      res.json({success: true, draftId: draft.id})
      return
    }

    // For sending/in-progress messages, cancel normally
    cancelJob(messageId)

    db.update(schema.messages)
      .set({status: 'cancelled', completedAt: sql`datetime('now')`})
      .where(eq(schema.messages.id, messageId))
      .run()

    // Mark pending recipients as skipped
    db.update(schema.messageRecipients)
      .set({status: 'skipped'})
      .where(
        sql`${schema.messageRecipients.messageId} = ${messageId} AND ${schema.messageRecipients.status} = 'pending'`,
      )
      .run()

    res.json({success: true})
  }),
)

// POST /api/messages/:id/send-now - Immediately send a scheduled or past_due message
messagesRouter.post(
  '/:id/send-now',
  asyncHandler(async (req, res) => {
    const messageId = Number(req.params.id)
    const message = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get()

    if (!message) {
      res.status(404).json({error: 'Message not found'})
      return
    }
    if (message.status !== 'scheduled' && message.status !== 'past_due') {
      res.status(400).json({error: 'Message is not scheduled or past due'})
      return
    }

    db.update(schema.messages).set({status: 'pending'}).where(eq(schema.messages.id, messageId)).run()

    const job = createJob(messageId, message.batchSize, message.batchDelayMs)
    processSendJob(job)

    res.json({success: true, jobId: job.id})
  }),
)

export async function processSendJob(job: SendJob) {
  const pendingRecipients = db
    .select({
      id: schema.messageRecipients.id,
      personId: schema.messageRecipients.personId,
      phoneNumber: schema.people.phoneNumber,
      renderedContent: schema.messageRecipients.renderedContent,
    })
    .from(schema.messageRecipients)
    .innerJoin(schema.people, eq(schema.messageRecipients.personId, schema.people.id))
    .where(
      sql`${schema.messageRecipients.messageId} = ${job.messageId} AND ${schema.messageRecipients.status} = 'pending'`,
    )
    .all()

  // Update message status to sending
  db.update(schema.messages).set({status: 'sending'}).where(eq(schema.messages.id, job.messageId)).run()

  job.status = 'processing'

  for (let i = 0; i < pendingRecipients.length; i++) {
    if (job.cancelled) break

    const recipient = pendingRecipients[i]

    try {
      await sendMessage(recipient.phoneNumber, recipient.renderedContent || '')

      db.update(schema.messageRecipients)
        .set({
          status: 'sent',
          sentAt: sql`datetime('now')`,
        })
        .where(eq(schema.messageRecipients.id, recipient.id))
        .run()

      db.update(schema.messages)
        .set({sentCount: sql`sent_count + 1`})
        .where(eq(schema.messages.id, job.messageId))
        .run()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      db.update(schema.messageRecipients)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
        })
        .where(eq(schema.messageRecipients.id, recipient.id))
        .run()

      db.update(schema.messages)
        .set({failedCount: sql`failed_count + 1`})
        .where(eq(schema.messages.id, job.messageId))
        .run()
    }

    // Delay between batches
    if (i < pendingRecipients.length - 1 && (i + 1) % job.batchSize === 0) {
      await new Promise((resolve) => setTimeout(resolve, job.batchDelayMs))
    }
  }

  // Update final status
  if (!job.cancelled) {
    db.update(schema.messages)
      .set({status: 'completed', completedAt: sql`datetime('now')`})
      .where(eq(schema.messages.id, job.messageId))
      .run()
  }

  job.status = 'completed'
}
