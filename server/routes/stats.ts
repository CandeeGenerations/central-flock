import {sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const statsRouter = Router()

statsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'month'

    // People counts
    const peopleStats = db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${schema.people.status} = 'active' then 1 else 0 end)`,
        inactive: sql<number>`sum(case when ${schema.people.status} = 'inactive' then 1 else 0 end)`,
        doNotContact: sql<number>`sum(case when ${schema.people.status} = 'do_not_contact' then 1 else 0 end)`,
      })
      .from(schema.people)
      .get()!

    // Groups total
    const groupsTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.groups)
      .get()!

    // Message aggregates (non-cancelled)
    const msgAgg = db
      .select({
        total: sql<number>`count(*)`,
        totalRecipients: sql<number>`coalesce(sum(${schema.messages.totalRecipients}), 0)`,
        totalSent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
        totalFailed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
        totalSkipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
      })
      .from(schema.messages)
      .where(sql`${schema.messages.status} != 'cancelled'`)
      .get()!

    // Recent messages (last 5)
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

    // Scheduled messages
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

    // Drafts count
    const draftsTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.drafts)
      .get()!

    // Templates count
    const templatesTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.templates)
      .get()!

    // Messages over time
    let overTimeData: {label: string; sent: number; failed: number; skipped: number}[]

    if (period === 'week') {
      // Last 12 weeks
      const rows = db
        .select({
          bucket: sql<string>`strftime('%Y-%W', ${schema.messages.createdAt})`,
          minDate: sql<string>`min(${schema.messages.createdAt})`,
          sent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
          failed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
          skipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
        })
        .from(schema.messages)
        .where(
          sql`${schema.messages.createdAt} >= datetime('now', '-84 days') AND ${schema.messages.status} != 'cancelled'`,
        )
        .groupBy(sql`strftime('%Y-%W', ${schema.messages.createdAt})`)
        .orderBy(sql`strftime('%Y-%W', ${schema.messages.createdAt}) ASC`)
        .all()

      overTimeData = rows.map((r) => {
        const d = new Date(r.minDate.endsWith('Z') ? r.minDate : r.minDate + 'Z')
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return {
          label: `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`,
          sent: r.sent,
          failed: r.failed,
          skipped: r.skipped,
        }
      })
    } else if (period === 'year') {
      // All years present
      const rows = db
        .select({
          bucket: sql<string>`strftime('%Y', ${schema.messages.createdAt})`,
          sent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
          failed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
          skipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
        })
        .from(schema.messages)
        .where(sql`${schema.messages.status} != 'cancelled'`)
        .groupBy(sql`strftime('%Y', ${schema.messages.createdAt})`)
        .orderBy(sql`strftime('%Y', ${schema.messages.createdAt}) ASC`)
        .all()

      overTimeData = rows.map((r) => ({
        label: r.bucket,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
      }))
    } else {
      // month (default) — last 12 months
      const rows = db
        .select({
          bucket: sql<string>`strftime('%Y-%m', ${schema.messages.createdAt})`,
          sent: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
          failed: sql<number>`coalesce(sum(${schema.messages.failedCount}), 0)`,
          skipped: sql<number>`coalesce(sum(${schema.messages.skippedCount}), 0)`,
        })
        .from(schema.messages)
        .where(
          sql`${schema.messages.createdAt} >= datetime('now', '-12 months') AND ${schema.messages.status} != 'cancelled'`,
        )
        .groupBy(sql`strftime('%Y-%m', ${schema.messages.createdAt})`)
        .orderBy(sql`strftime('%Y-%m', ${schema.messages.createdAt}) ASC`)
        .all()

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      overTimeData = rows.map((r) => {
        const monthIndex = parseInt(r.bucket.split('-')[1], 10) - 1
        return {
          label: monthNames[monthIndex],
          sent: r.sent,
          failed: r.failed,
          skipped: r.skipped,
        }
      })
    }

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
        overTime: {
          period,
          data: overTimeData,
        },
      },
      drafts: {total: draftsTotal.total},
      templates: {total: templatesTotal.total},
    })
  }),
)
