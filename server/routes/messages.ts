import {Router} from 'express'
import {db, schema} from '../db/index.js'
import {eq, sql, desc} from 'drizzle-orm'
import {sendMessage} from '../services/applescript.js'
import {
  getJob,
  cancelJob,
  createJob,
  type SendJob,
} from '../services/message-queue.js'

export const messagesRouter = Router()

// POST /api/messages/send - Send message
messagesRouter.post('/send', async (req, res) => {
  try {
    const {
      content,
      recipientIds,
      excludeIds = [],
      groupId,
      batchSize = 1,
      batchDelayMs = 5000,
    } = req.body as {
      content: string
      recipientIds: number[]
      excludeIds?: number[]
      groupId?: number
      batchSize?: number
      batchDelayMs?: number
    }

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
    const activeRecipients = recipients.filter(
      (r) => !excludeSet.has(r.id) && r.status === 'active',
    )
    const skippedRecipients = recipients.filter(
      (r) => excludeSet.has(r.id) || r.status !== 'active',
    )

    // Create message record
    const message = db
      .insert(schema.messages)
      .values({
        content,
        renderedPreview: renderTemplate(
          content,
          activeRecipients[0] || recipients[0],
        ),
        groupId: groupId || null,
        totalRecipients: recipients.length,
        skippedCount: skippedRecipients.length,
        status: 'pending',
        batchSize,
        batchDelayMs,
      })
      .returning()
      .get()

    // Create recipient records
    for (const person of activeRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId: message.id,
          personId: person.id,
          renderedContent: renderTemplate(content, person),
          status: 'pending',
        })
        .run()
    }

    for (const person of skippedRecipients) {
      db.insert(schema.messageRecipients)
        .values({
          messageId: message.id,
          personId: person.id,
          renderedContent: renderTemplate(content, person),
          status: 'skipped',
        })
        .run()
    }

    // Start async sending
    const job = createJob(message.id, batchSize, batchDelayMs)
    processSendJob(job)

    res.status(201).json({messageId: message.id, jobId: job.id})
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({error: 'Failed to send message'})
  }
})

// POST /api/messages/delete - Delete messages by IDs
messagesRouter.post('/delete', async (req, res) => {
  try {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No message IDs provided'})
      return
    }

    for (const id of ids) {
      db.delete(schema.messages).where(eq(schema.messages.id, id)).run()
    }

    res.json({success: true, deleted: ids.length})
  } catch (error) {
    console.error('Error deleting messages:', error)
    res.status(500).json({error: 'Failed to delete messages'})
  }
})

// GET /api/messages - Message history
messagesRouter.get('/', async (_req, res) => {
  try {
    const messagesList = db
      .select()
      .from(schema.messages)
      .orderBy(desc(schema.messages.createdAt))
      .all()

    // Attach group names
    const result = messagesList.map((msg) => {
      let groupName = null
      if (msg.groupId) {
        const group = db
          .select({name: schema.groups.name})
          .from(schema.groups)
          .where(eq(schema.groups.id, msg.groupId))
          .get()
        groupName = group?.name || null
      }
      return {...msg, groupName}
    })

    res.json(result)
  } catch (error) {
    console.error('Error fetching messages:', error)
    res.status(500).json({error: 'Failed to fetch messages'})
  }
})

// GET /api/messages/:id - Message detail
messagesRouter.get('/:id', async (req, res) => {
  try {
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
      .innerJoin(
        schema.people,
        eq(schema.messageRecipients.personId, schema.people.id),
      )
      .where(eq(schema.messageRecipients.messageId, message.id))
      .all()

    let groupName = null
    if (message.groupId) {
      const group = db
        .select({name: schema.groups.name})
        .from(schema.groups)
        .where(eq(schema.groups.id, message.groupId))
        .get()
      groupName = group?.name || null
    }

    res.json({...message, groupName, recipients})
  } catch (error) {
    console.error('Error fetching message:', error)
    res.status(500).json({error: 'Failed to fetch message'})
  }
})

// GET /api/messages/:id/status - Poll send progress
messagesRouter.get('/:id/status', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching message status:', error)
    res.status(500).json({error: 'Failed to fetch message status'})
  }
})

// POST /api/messages/:id/cancel - Cancel in-progress batch
messagesRouter.post('/:id/cancel', async (req, res) => {
  try {
    const messageId = Number(req.params.id)
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
  } catch (error) {
    console.error('Error cancelling message:', error)
    res.status(500).json({error: 'Failed to cancel message'})
  }
})

function renderTemplate(
  template: string,
  person: {firstName?: string | null; lastName?: string | null},
): string {
  const firstName = person.firstName || ''
  const lastName = person.lastName || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  return template
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{lastName\}\}/g, lastName)
    .replace(/\{\{fullName\}\}/g, fullName)
}

async function processSendJob(job: SendJob) {
  const pendingRecipients = db
    .select({
      id: schema.messageRecipients.id,
      personId: schema.messageRecipients.personId,
      phoneNumber: schema.people.phoneNumber,
      renderedContent: schema.messageRecipients.renderedContent,
    })
    .from(schema.messageRecipients)
    .innerJoin(
      schema.people,
      eq(schema.messageRecipients.personId, schema.people.id),
    )
    .where(
      sql`${schema.messageRecipients.messageId} = ${job.messageId} AND ${schema.messageRecipients.status} = 'pending'`,
    )
    .all()

  // Update message status to sending
  db.update(schema.messages)
    .set({status: 'sending'})
    .where(eq(schema.messages.id, job.messageId))
    .run()

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
