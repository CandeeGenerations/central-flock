import {Router} from 'express'
import {db, schema} from '../db/index.js'
import {eq, like, or, and, sql, inArray, desc, asc} from 'drizzle-orm'

export const peopleRouter = Router()

// GET /api/people - List all with optional search/filter
peopleRouter.get('/', async (req, res) => {
  try {
    const {
      search,
      status,
      groupId,
      page = '1',
      limit = '50',
      sort = 'createdAt',
      sortDir = 'desc',
    } = req.query
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
            .innerJoin(
              schema.groups,
              eq(schema.peopleGroups.groupId, schema.groups.id),
            )
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
  } catch (error) {
    console.error('Error fetching people:', error)
    res.status(500).json({error: 'Failed to fetch people'})
  }
})

// GET /api/people/:id - Get person with groups
peopleRouter.get('/:id', async (req, res) => {
  try {
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
      .innerJoin(
        schema.groups,
        eq(schema.peopleGroups.groupId, schema.groups.id),
      )
      .where(eq(schema.peopleGroups.personId, person.id))
      .all()

    res.json({...person, groups})
  } catch (error) {
    console.error('Error fetching person:', error)
    res.status(500).json({error: 'Failed to fetch person'})
  }
})

// POST /api/people - Create person
peopleRouter.post('/', async (req, res) => {
  try {
    const {firstName, lastName, phoneNumber, phoneDisplay, status, notes} =
      req.body
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
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      res
        .status(409)
        .json({error: 'A person with this phone number already exists'})
      return
    }
    console.error('Error creating person:', error)
    res.status(500).json({error: 'Failed to create person'})
  }
})

// PUT /api/people/:id - Update person
peopleRouter.put('/:id', async (req, res) => {
  try {
    const {firstName, lastName, phoneNumber, phoneDisplay, status, notes} =
      req.body
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
  } catch (error) {
    console.error('Error updating person:', error)
    res.status(500).json({error: 'Failed to update person'})
  }
})

// DELETE /api/people/:id - Delete person
peopleRouter.delete('/:id', async (req, res) => {
  try {
    const personId = Number(req.params.id)

    // Remove related records first
    db.delete(schema.peopleGroups)
      .where(eq(schema.peopleGroups.personId, personId))
      .run()
    db.delete(schema.messageRecipients)
      .where(eq(schema.messageRecipients.personId, personId))
      .run()

    const result = db
      .delete(schema.people)
      .where(eq(schema.people.id, personId))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Person not found'})
      return
    }
    res.json({success: true})
  } catch (error) {
    console.error('Error deleting person:', error)
    res.status(500).json({error: 'Failed to delete person'})
  }
})

// PATCH /api/people/:id/status - Toggle status
peopleRouter.patch('/:id/status', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error toggling status:', error)
    res.status(500).json({error: 'Failed to toggle status'})
  }
})
