import {and, asc, desc, eq, inArray, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'

export const peopleRouter = Router()

// GET /api/people - List all with optional search/filter
peopleRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {search, status, groupId, page = '1', limit = '50', sort = 'createdAt', sortDir = 'desc'} = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const conditions = []

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          like(schema.people.firstName, `%${search}%`),
          like(schema.people.lastName, `%${search}%`),
          like(schema.people.phoneNumber, `%${search}%`),
          like(schema.people.phoneDisplay, `%${search}%`),
        ),
      )
    }

    if (status && typeof status === 'string') {
      conditions.push(eq(schema.people.status, status as 'active' | 'inactive'))
    }

    if (groupId && typeof groupId === 'string') {
      const memberIds = db
        .select({personId: schema.peopleGroups.personId})
        .from(schema.peopleGroups)
        .where(eq(schema.peopleGroups.groupId, Number(groupId)))
      conditions.push(inArray(schema.people.id, memberIds))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [peopleList, countResult] = await Promise.all([
      db
        .select()
        .from(schema.people)
        .where(where)
        .limit(Number(limit))
        .offset(offset)
        .orderBy(
          ...((): ReturnType<typeof desc>[] => {
            const dir = sortDir === 'asc' ? asc : desc
            switch (sort) {
              case 'firstName':
                return [dir(schema.people.firstName)]
              case 'lastName':
                return [dir(schema.people.lastName)]
              case 'createdAt':
                return [dir(schema.people.createdAt)]
              default:
                return [dir(schema.people.createdAt)]
            }
          })(),
        ),
      db
        .select({count: sql<number>`count(*)`})
        .from(schema.people)
        .where(where),
    ])

    // Get group memberships for all returned people
    const peopleIds = peopleList.map((p) => p.id)
    const memberships =
      peopleIds.length > 0
        ? db
            .select({
              personId: schema.peopleGroups.personId,
              groupId: schema.peopleGroups.groupId,
              groupName: schema.groups.name,
            })
            .from(schema.peopleGroups)
            .innerJoin(schema.groups, eq(schema.peopleGroups.groupId, schema.groups.id))
            .where(inArray(schema.peopleGroups.personId, peopleIds))
            .all()
        : []

    const membershipMap = new Map<number, {id: number; name: string}[]>()
    for (const m of memberships) {
      if (!membershipMap.has(m.personId)) membershipMap.set(m.personId, [])
      membershipMap.get(m.personId)!.push({id: m.groupId, name: m.groupName})
    }

    const result = peopleList.map((p) => ({
      ...p,
      groups: membershipMap.get(p.id) || [],
    }))

    res.json({
      data: result,
      total: countResult[0].count,
      page: Number(page),
      limit: Number(limit),
    })
  }),
)

// GET /api/people/:id - Get person with groups
peopleRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const person = db
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, Number(req.params.id)))
      .get()
    if (!person) {
      res.status(404).json({error: 'Person not found'})
      return
    }

    const groups = db
      .select({
        id: schema.groups.id,
        name: schema.groups.name,
      })
      .from(schema.peopleGroups)
      .innerJoin(schema.groups, eq(schema.peopleGroups.groupId, schema.groups.id))
      .where(eq(schema.peopleGroups.personId, person.id))
      .all()

    res.json({...person, groups})
  }),
)

// POST /api/people - Create person
peopleRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {firstName, lastName, phoneNumber, phoneDisplay, status, notes} = req.body
    try {
      const result = db
        .insert(schema.people)
        .values({
          firstName: firstName || null,
          lastName: lastName || null,
          phoneNumber,
          phoneDisplay: phoneDisplay || null,
          status: status || 'active',
          notes: notes || null,
        })
        .returning()
        .get()

      res.status(201).json(result)
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({error: 'A person with this phone number already exists'})
        return
      }
      throw error
    }
  }),
)

// PUT /api/people/:id - Update person
peopleRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const {firstName, lastName, phoneNumber, phoneDisplay, status, notes} = req.body
    const result = db
      .update(schema.people)
      .set({
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        phoneNumber: phoneNumber ?? undefined,
        phoneDisplay: phoneDisplay ?? undefined,
        status: status ?? undefined,
        notes: notes ?? undefined,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.people.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Person not found'})
      return
    }
    res.json(result)
  }),
)

// DELETE /api/people/:id - Delete person
peopleRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const personId = Number(req.params.id)

    // Remove related records first
    db.delete(schema.peopleGroups).where(eq(schema.peopleGroups.personId, personId)).run()
    db.delete(schema.messageRecipients).where(eq(schema.messageRecipients.personId, personId)).run()

    const result = db.delete(schema.people).where(eq(schema.people.id, personId)).returning().get()

    if (!result) {
      res.status(404).json({error: 'Person not found'})
      return
    }
    res.json({success: true})
  }),
)

// PATCH /api/people/:id/status - Toggle status
peopleRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const person = db
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, Number(req.params.id)))
      .get()
    if (!person) {
      res.status(404).json({error: 'Person not found'})
      return
    }
    const newStatus = person.status === 'active' ? 'inactive' : 'active'
    const result = db
      .update(schema.people)
      .set({status: newStatus, updatedAt: sql`datetime('now')`})
      .where(eq(schema.people.id, Number(req.params.id)))
      .returning()
      .get()

    res.json(result)
  }),
)
