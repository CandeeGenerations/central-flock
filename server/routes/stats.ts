import {type SQL, and, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const statsRouter = Router()

function buildMessageDateFilter(from?: string, to?: string) {
  const conditions: SQL[] = [sql`${schema.messages.status} != 'cancelled'`]
  if (from) conditions.push(sql`${schema.messages.createdAt} >= ${from}`)
  if (to) conditions.push(sql`${schema.messages.createdAt} < ${to}`)
  return and(...conditions)!
}

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // All-time people counts
    const peopleStats = db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${schema.people.status} = 'active' then 1 else 0 end)`,
        inactive: sql<number>`sum(case when ${schema.people.status} = 'inactive' then 1 else 0 end)`,
        doNotContact: sql<number>`sum(case when ${schema.people.status} = 'do_not_contact' then 1 else 0 end)`,
      })
      .from(schema.people)
      .get()!

    // All-time groups total
    const groupsTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.groups)
      .get()!

    // All-time message aggregates
    const allTimeMessageFilter = buildMessageDateFilter()
    const msgAgg = db
      .select({
        total: sql<number>`count(*)`,
        totalRecipients: sql<number>`coalesce(sum(${schema.messages.totalRecipients}), 0)`,
        totalSent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
        totalFailed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
        totalSkipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
      })
      .from(schema.messages)
      .where(allTimeMessageFilter)
      .get()!

    // Recent messages (last 5, all-time)
    const recentMessages = db
      .select({
        id: schema.messages.id,
        content: schema.messages.content,
        renderedPreview: schema.messages.renderedPreview,
        status: schema.messages.status,
        totalRecipients: schema.messages.totalRecipients,
        sentCount: schema.messages.sentCount,
        failedCount: schema.messages.failedCount,
        groupId: schema.messages.groupId,
        groupName: schema.groups.name,
        createdAt: schema.messages.createdAt,
        completedAt: schema.messages.completedAt,
      })
      .from(schema.messages)
      .leftJoin(schema.groups, sql`${schema.messages.groupId} = ${schema.groups.id}`)
      .where(sql`${schema.messages.status} IN ('completed', 'sending', 'pending', 'cancelled')`)
      .orderBy(sql`${schema.messages.createdAt} DESC`)
      .limit(5)
      .all()

    // Scheduled messages (all-time)
    const scheduledMessages = db
      .select({
        id: schema.messages.id,
        content: schema.messages.content,
        renderedPreview: schema.messages.renderedPreview,
        status: schema.messages.status,
        totalRecipients: schema.messages.totalRecipients,
        groupName: schema.groups.name,
        scheduledAt: schema.messages.scheduledAt,
      })
      .from(schema.messages)
      .leftJoin(schema.groups, sql`${schema.messages.groupId} = ${schema.groups.id}`)
      .where(sql`${schema.messages.status} IN ('scheduled', 'past_due')`)
      .orderBy(sql`${schema.messages.scheduledAt} ASC`)
      .all()

    // All-time drafts count
    const draftsTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.drafts)
      .get()!

    // All-time templates count
    const templatesTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.templates)
      .get()!

    res.json({
      people: {
        total: peopleStats.total,
        active: peopleStats.active,
        inactive: peopleStats.inactive,
        doNotContact: peopleStats.doNotContact,
      },
      groups: {
        total: groupsTotal.total,
      },
      messages: {
        total: msgAgg.total,
        totalRecipients: msgAgg.totalRecipients,
        totalSent: msgAgg.totalSent,
        totalFailed: msgAgg.totalFailed,
        totalSkipped: msgAgg.totalSkipped,
        recentMessages,
        scheduledMessages,
      },
      drafts: {total: draftsTotal.total},
      templates: {total: templatesTotal.total},
    })
  }),
)

statsRouter.get(
  '/over-time',
  asyncHandler(async (req, res) => {
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    res.json({data: buildOverTimeData(from, to)})
  }),
)

function buildOverTimeData(from?: string, to?: string) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  let spanDays = 365
  if (from) {
    const fromDate = new Date(from)
    const toDate = to ? new Date(to) : new Date()
    spanDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
  } else if (!from && !to) {
    spanDays = 9999
  }

  const dateFilter = buildMessageDateFilter(from, to)

  if (spanDays <= 30) {
    // Daily buckets for short ranges
    const rows = db
      .select({
        bucket: sql<string>`strftime('%Y-%m-%d', ${schema.messages.createdAt})`,
        sent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
        failed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
        skipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
      })
      .from(schema.messages)
      .where(dateFilter)
      .groupBy(sql`strftime('%Y-%m-%d', ${schema.messages.createdAt})`)
      .orderBy(sql`strftime('%Y-%m-%d', ${schema.messages.createdAt}) ASC`)
      .all()

    return rows.map((r) => {
      const [, m, d] = r.bucket.split('-')
      const monthIndex = parseInt(m, 10) - 1
      return {
        label: `${monthNames[monthIndex]} ${parseInt(d, 10)}`,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
      }
    })
  } else {
    // Weekly buckets for everything else
    const rows = db
      .select({
        bucket: sql<string>`strftime('%Y-%W', ${schema.messages.createdAt})`,
        minDate: sql<string>`min(${schema.messages.createdAt})`,
        sent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
        failed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
        skipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
      })
      .from(schema.messages)
      .where(dateFilter)
      .groupBy(sql`strftime('%Y-%W', ${schema.messages.createdAt})`)
      .orderBy(sql`strftime('%Y-%W', ${schema.messages.createdAt}) ASC`)
      .all()

    return rows.map((r) => {
      const d = new Date(r.minDate.endsWith('Z') ? r.minDate : r.minDate + 'Z')
      return {
        label: `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
      }
    })
  }
}
