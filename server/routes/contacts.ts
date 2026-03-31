import {eq, inArray} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {createContact, fetchContacts} from '../services/applescript.js'
import {e164ToDisplay, normalizePhoneNumber} from '../services/csv-parser.js'

export const contactsRouter = Router()

// GET /api/contacts - Fetch macOS contacts with match status
contactsRouter.get('/', async (_req, res) => {
  try {
    const macContacts = await fetchContacts()

    // Get dismissed contact IDs
    const dismissed = db.select().from(schema.dismissedContacts).all()
    const dismissedIds = new Set(dismissed.map((d) => d.contactId))

    // Filter out dismissed and contacts with no phones
    const activeContacts = macContacts.filter((c) => !dismissedIds.has(c.id) && c.phones.length > 0)

    // Get all existing people
    const existingPeople = db.select().from(schema.people).all()
    const phoneMap = new Map(existingPeople.filter((p) => p.phoneNumber).map((p) => [p.phoneNumber!, p]))

    // Match each contact
    const results = activeContacts.map((contact) => {
      const normalizedPhones = contact.phones.map((p) => ({
        ...p,
        normalized: normalizePhoneNumber(p.value),
      }))

      // Find first matching phone
      const matchingPhone = normalizedPhones.find((p) => phoneMap.has(p.normalized))
      const existingPerson = matchingPhone ? phoneMap.get(matchingPhone.normalized) : undefined

      let matchStatus: 'new' | 'exists' | 'differs' = 'new'
      let differences: {field: string; contact: string; existing: string}[] | undefined

      if (existingPerson) {
        const nameMatches =
          (existingPerson.firstName || '') === contact.firstName &&
          (existingPerson.lastName || '') === contact.lastName

        if (nameMatches) {
          matchStatus = 'exists'
        } else {
          matchStatus = 'differs'
          differences = []
          if ((existingPerson.firstName || '') !== contact.firstName) {
            differences.push({
              field: 'firstName',
              contact: contact.firstName,
              existing: existingPerson.firstName || '',
            })
          }
          if ((existingPerson.lastName || '') !== contact.lastName) {
            differences.push({
              field: 'lastName',
              contact: contact.lastName,
              existing: existingPerson.lastName || '',
            })
          }
        }
      }

      return {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phones: normalizedPhones,
        matchStatus,
        existingPersonId: existingPerson?.id,
        differences,
      }
    })

    res.json({contacts: results, total: results.length})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching contacts:', message)
    res.status(500).json({error: `Failed to fetch contacts: ${message}`})
  }
})

// POST /api/contacts/import - Import selected contacts
contactsRouter.post('/import', async (req, res) => {
  try {
    const {contacts, skipDuplicates = true} = req.body as {
      contacts: {
        firstName: string
        lastName: string
        phoneNumber: string
        phoneDisplay: string
      }[]
      skipDuplicates?: boolean
    }

    let created = 0
    let updated = 0
    let skipped = 0

    for (const contact of contacts) {
      const existing = db
        .select()
        .from(schema.people)
        .where(eq(schema.people.phoneNumber, contact.phoneNumber))
        .get()

      if (existing) {
        if (skipDuplicates) {
          skipped++
        } else {
          db.update(schema.people)
            .set({
              firstName: contact.firstName || existing.firstName,
              lastName: contact.lastName || existing.lastName,
              phoneDisplay: e164ToDisplay(contact.phoneNumber) || existing.phoneDisplay,
            })
            .where(eq(schema.people.id, existing.id))
            .run()
          updated++
        }
      } else {
        db.insert(schema.people)
          .values({
            firstName: contact.firstName || null,
            lastName: contact.lastName || null,
            phoneNumber: contact.phoneNumber,
            phoneDisplay: e164ToDisplay(contact.phoneNumber) || null,
            status: 'active',
          })
          .returning()
          .get()
        created++
      }
    }

    res.json({created, updated, skipped})
  } catch (error) {
    console.error('Error importing contacts:', error)
    res.status(500).json({error: 'Failed to import contacts'})
  }
})

// POST /api/contacts/dismiss - Dismiss contacts
contactsRouter.post('/dismiss', async (req, res) => {
  try {
    const {contacts} = req.body as {contacts: {contactId: string; firstName?: string; lastName?: string}[]}

    let dismissed = 0
    for (const contact of contacts) {
      try {
        db.insert(schema.dismissedContacts)
          .values({
            contactId: contact.contactId,
            firstName: contact.firstName || null,
            lastName: contact.lastName || null,
          })
          .run()
        dismissed++
      } catch {
        // Ignore duplicates
      }
    }

    res.json({dismissed})
  } catch (error) {
    console.error('Error dismissing contacts:', error)
    res.status(500).json({error: 'Failed to dismiss contacts'})
  }
})

// GET /api/contacts/dismissed - List dismissed contacts
contactsRouter.get('/dismissed', async (_req, res) => {
  try {
    const dismissed = db.select().from(schema.dismissedContacts).all()
    res.json({contacts: dismissed, total: dismissed.length})
  } catch (error) {
    console.error('Error fetching dismissed contacts:', error)
    res.status(500).json({error: 'Failed to fetch dismissed contacts'})
  }
})

// DELETE /api/contacts/dismiss/:contactId - Un-dismiss a contact
contactsRouter.delete('/dismiss/:contactId', async (req, res) => {
  try {
    const {contactId} = req.params
    db.delete(schema.dismissedContacts).where(eq(schema.dismissedContacts.contactId, contactId)).run()
    res.json({success: true})
  } catch (error) {
    console.error('Error un-dismissing contact:', error)
    res.status(500).json({error: 'Failed to un-dismiss contact'})
  }
})

// POST /api/contacts/create - Create single contact in macOS Contacts
contactsRouter.post('/create', async (req, res) => {
  try {
    const {personId} = req.body as {personId: number}
    const person = db.select().from(schema.people).where(eq(schema.people.id, personId)).get()
    if (!person) {
      res.status(404).json({error: 'Person not found'})
      return
    }

    if (!person.phoneNumber) {
      res.status(400).json({error: 'Person has no phone number'})
      return
    }

    await createContact(person.firstName || '', person.lastName || '', person.phoneNumber)

    res.json({success: true})
  } catch (error) {
    console.error('Error creating contact:', error)
    res.status(500).json({error: 'Failed to create contact'})
  }
})

// POST /api/contacts/create-bulk - Create multiple contacts
contactsRouter.post('/create-bulk', async (req, res) => {
  try {
    const {personIds} = req.body as {personIds: number[]}
    const people = db.select().from(schema.people).where(inArray(schema.people.id, personIds)).all()

    const results = []
    for (const person of people) {
      if (!person.phoneNumber) {
        results.push({personId: person.id, success: false, error: 'No phone number'})
        continue
      }
      try {
        await createContact(person.firstName || '', person.lastName || '', person.phoneNumber)
        results.push({personId: person.id, success: true})
      } catch (error) {
        results.push({
          personId: person.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      total: people.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    })
  } catch (error) {
    console.error('Error creating contacts:', error)
    res.status(500).json({error: 'Failed to create contacts'})
  }
})
