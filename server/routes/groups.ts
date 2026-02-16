import {and, eq, inArray, notInArray, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'

export const groupsRouter = Router()

// GET /api/groups - List all with member counts
groupsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const groupsList = db.select().from(schema.groups).orderBy(schema.groups.name).all()

    const counts = db
      .select({
        groupId: schema.peopleGroups.groupId,
        count: sql<number>`count(*)`,
      })
      .from(schema.peopleGroups)
      .groupBy(schema.peopleGroups.groupId)
      .all()

    const countMap = new Map(counts.map((c) => [c.groupId, c.count]))

    const result = groupsList.map((g) => ({
      ...g,
      memberCount: countMap.get(g.id) || 0,
    }))

    res.json(result)
  }),
)

// GET /api/groups/:id/export - Export group members as CSV
groupsRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const group = db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, Number(req.params.id)))
      .get()
    if (!group) {
      res.status(404).json({error: 'Group not found'})
      return
    }

    const members = db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        phoneNumber: schema.people.phoneNumber,
        phoneDisplay: schema.people.phoneDisplay,
        status: schema.people.status,
      })
      .from(schema.peopleGroups)
      .innerJoin(schema.people, eq(schema.peopleGroups.personId, schema.people.id))
      .where(eq(schema.peopleGroups.groupId, group.id))
      .orderBy(schema.people.lastName, schema.people.firstName)
      .all()

    // Get all group memberships for these people
    const memberIds = members.map((m) => m.id)
    const memberships =
      memberIds.length > 0
        ? db
            .select({
              personId: schema.peopleGroups.personId,
              groupName: schema.groups.name,
            })
            .from(schema.peopleGroups)
            .innerJoin(schema.groups, eq(schema.peopleGroups.groupId, schema.groups.id))
            .where(inArray(schema.peopleGroups.personId, memberIds))
            .all()
        : []

    const membershipMap = new Map<number, string[]>()
    for (const m of memberships) {
      if (!membershipMap.has(m.personId)) membershipMap.set(m.personId, [])
      membershipMap.get(m.personId)!.push(m.groupName)
    }

    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const rows = ['First Name,Last Name,Phone Number,Status,Groups']
    for (const p of members) {
      const phone = p.phoneDisplay || p.phoneNumber
      const groups = (membershipMap.get(p.id) || []).join(', ')
      rows.push([p.firstName || '', p.lastName || '', phone, p.status, groups].map((v) => escapeCSV(v)).join(','))
    }

    const safeName = group.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-export.csv"`)
    res.send(rows.join('\n'))
  }),
)

// GET /api/groups/:id - Get group with members
groupsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, Number(req.params.id)))
      .get()
    if (!group) {
      res.status(404).json({error: 'Group not found'})
      return
    }

    const members = db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        phoneNumber: schema.people.phoneNumber,
        phoneDisplay: schema.people.phoneDisplay,
        status: schema.people.status,
      })
      .from(schema.peopleGroups)
      .innerJoin(schema.people, eq(schema.peopleGroups.personId, schema.people.id))
      .where(eq(schema.peopleGroups.groupId, group.id))
      .orderBy(schema.people.lastName, schema.people.firstName)
      .all()

    res.json({...group, members})
  }),
)

// POST /api/groups - Create group
groupsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {name, description} = req.body
    try {
      const result = db
        .insert(schema.groups)
        .values({
          name,
          description: description || null,
        })
        .returning()
        .get()

      res.status(201).json(result)
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({error: 'A group with this name already exists'})
        return
      }
      throw error
    }
  }),
)

// PUT /api/groups/:id - Update group
groupsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const {name, description} = req.body
    const result = db
      .update(schema.groups)
      .set({
        name: name ?? undefined,
        description: description ?? undefined,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.groups.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Group not found'})
      return
    }
    res.json(result)
  }),
)

// DELETE /api/groups/:id - Delete group
groupsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = db
      .delete(schema.groups)
      .where(eq(schema.groups.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Group not found'})
      return
    }
    res.json({success: true})
  }),
)

// POST /api/groups/:id/members - Add people to group
groupsRouter.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.id)
    const {personIds} = req.body as {personIds: number[]}

    const group = db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).get()
    if (!group) {
      res.status(404).json({error: 'Group not found'})
      return
    }

    // Get existing memberships to avoid duplicates
    const existing = db
      .select({personId: schema.peopleGroups.personId})
      .from(schema.peopleGroups)
      .where(and(eq(schema.peopleGroups.groupId, groupId), inArray(schema.peopleGroups.personId, personIds)))
      .all()

    const existingIds = new Set(existing.map((e) => e.personId))
    const newIds = personIds.filter((id) => !existingIds.has(id))

    if (newIds.length > 0) {
      db.insert(schema.peopleGroups)
        .values(newIds.map((personId) => ({personId, groupId})))
        .run()
    }

    res.json({added: newIds.length, alreadyMembers: existingIds.size})
  }),
)

// DELETE /api/groups/:id/members - Remove people from group
groupsRouter.delete(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.id)
    const {personIds} = req.body as {personIds: number[]}

    db.delete(schema.peopleGroups)
      .where(and(eq(schema.peopleGroups.groupId, groupId), inArray(schema.peopleGroups.personId, personIds)))
      .run()

    res.json({success: true})
  }),
)

// GET /api/groups/:id/non-members - Get people not in this group
groupsRouter.get(
  '/:id/non-members',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.id)
    const {search, page = '1', limit = '30'} = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const memberIds = db
      .select({personId: schema.peopleGroups.personId})
      .from(schema.peopleGroups)
      .where(eq(schema.peopleGroups.groupId, groupId))

    const conditions = [notInArray(schema.people.id, memberIds)]

    if (search && typeof search === 'string') {
      conditions.push(
        sql`(${schema.people.firstName} LIKE ${'%' + search + '%'} OR ${schema.people.lastName} LIKE ${'%' + search + '%'} OR ${schema.people.phoneDisplay} LIKE ${'%' + search + '%'} OR (COALESCE(${schema.people.firstName}, '') || ' ' || COALESCE(${schema.people.lastName}, '')) LIKE ${'%' + search + '%'})`,
      )
    }

    const where = and(...conditions)

    const [nonMembers, countResult] = await Promise.all([
      db
        .select()
        .from(schema.people)
        .where(where)
        .orderBy(schema.people.lastName, schema.people.firstName)
        .limit(Number(limit))
        .offset(offset),
      db
        .select({count: sql<number>`count(*)`})
        .from(schema.people)
        .where(where),
    ])

    res.json({
      data: nonMembers,
      total: countResult[0]?.count || 0,
      page: Number(page),
      limit: Number(limit),
    })
  }),
)
