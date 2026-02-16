import {and, asc, desc, eq, inArray, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'

export const peopleRouter = Router()

// GET /api/people/duplicates - Find duplicate people
peopleRouter.get(
  '/duplicates',
  asyncHandler(async (_req, res) => {
    // Name duplicates: group by lowercase (firstName, lastName) where both non-null
    const namePairs = db
      .select({
        firstName: sql<string>`LOWER(${schema.people.firstName})`,
        lastName: sql<string>`LOWER(${schema.people.lastName})`,
        count: sql<number>`count(*)`,
      })
      .from(schema.people)
      .where(and(sql`${schema.people.firstName} IS NOT NULL`, sql`${schema.people.lastName} IS NOT NULL`))
      .groupBy(sql`LOWER(${schema.people.firstName})`, sql`LOWER(${schema.people.lastName})`)
      .having(sql`count(*) > 1`)
      .all()

    const nameDuplicates = []
    for (const pair of namePairs) {
      const people = db
        .select()
        .from(schema.people)
        .where(
          and(
            sql`LOWER(${schema.people.firstName}) = ${pair.firstName}`,
            sql`LOWER(${schema.people.lastName}) = ${pair.lastName}`,
          ),
        )
        .all()
      const displayName = people[0].firstName && people[0].lastName
        ? `${people[0].firstName} ${people[0].lastName}`
        : pair.firstName + ' ' + pair.lastName
      nameDuplicates.push({name: displayName, people})
    }

    // Similar phones: fetch all, pairwise compare
    const allPeople = db.select().from(schema.people).all()
    const phoneClusters: Map<number, Set<number>> = new Map()
    const personById = new Map(allPeople.map((p) => [p.id, p]))

    for (let i = 0; i < allPeople.length; i++) {
      for (let j = i + 1; j < allPeople.length; j++) {
        const a = allPeople[i].phoneNumber
        const b = allPeople[j].phoneNumber
        if (a.length === b.length) {
          let diff = 0
          for (let k = 0; k < a.length; k++) {
            if (a[k] !== b[k]) diff++
            if (diff > 2) break
          }
          if (diff > 0 && diff <= 2) {
            // Merge into clusters using union-find style
            const idA = allPeople[i].id
            const idB = allPeople[j].id
            const clusterA = phoneClusters.get(idA)
            const clusterB = phoneClusters.get(idB)
            if (clusterA && clusterB) {
              // Merge B into A
              for (const id of clusterB) {
                clusterA.add(id)
                phoneClusters.set(id, clusterA)
              }
            } else if (clusterA) {
              clusterA.add(idB)
              phoneClusters.set(idB, clusterA)
            } else if (clusterB) {
              clusterB.add(idA)
              phoneClusters.set(idA, clusterB)
            } else {
              const cluster = new Set([idA, idB])
              phoneClusters.set(idA, cluster)
              phoneClusters.set(idB, cluster)
            }
          }
        }
      }
    }

    // Dedupe clusters
    const seenClusters = new Set<Set<number>>()
    const phoneDuplicates = []
    for (const cluster of phoneClusters.values()) {
      if (seenClusters.has(cluster)) continue
      seenClusters.add(cluster)
      phoneDuplicates.push({
        people: [...cluster].map((id) => personById.get(id)!),
      })
    }

    res.json({nameDuplicates, phoneDuplicates})
  }),
)

// GET /api/people/export - Export all people as CSV
peopleRouter.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const peopleList = db.select().from(schema.people).orderBy(asc(schema.people.firstName)).all()

    const peopleIds = peopleList.map((p) => p.id)
    const memberships =
      peopleIds.length > 0
        ? db
            .select({
              personId: schema.peopleGroups.personId,
              groupName: schema.groups.name,
            })
            .from(schema.peopleGroups)
            .innerJoin(schema.groups, eq(schema.peopleGroups.groupId, schema.groups.id))
            .where(inArray(schema.peopleGroups.personId, peopleIds))
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
    for (const p of peopleList) {
      const phone = p.phoneDisplay || p.phoneNumber
      const groups = (membershipMap.get(p.id) || []).join(', ')
      rows.push(
        [p.firstName || '', p.lastName || '', phone, p.status, groups].map((v) => escapeCSV(v)).join(','),
      )
    }

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="people-export.csv"')
    res.send(rows.join('\n'))
  }),
)

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
          sql`(COALESCE(${schema.people.firstName}, '') || ' ' || COALESCE(${schema.people.lastName}, '')) LIKE ${'%' + search + '%'}`,
        ),
      )
    }

    if (status && typeof status === 'string') {
      conditions.push(eq(schema.people.status, status as 'active' | 'inactive' | 'do_not_contact'))
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
    const newStatus = person.status === 'active' ? 'inactive' : person.status === 'inactive' ? 'active' : person.status
    const result = db
      .update(schema.people)
      .set({status: newStatus, updatedAt: sql`datetime('now')`})
      .where(eq(schema.people.id, Number(req.params.id)))
      .returning()
      .get()

    res.json(result)
  }),
)
