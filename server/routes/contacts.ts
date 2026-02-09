import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { createContact } from '../services/applescript.js';

export const contactsRouter = Router();

// POST /api/contacts/create - Create single contact in macOS Contacts
contactsRouter.post('/create', async (req, res) => {
  try {
    const { personId } = req.body as { personId: number };
    const person = db.select().from(schema.people).where(eq(schema.people.id, personId)).get();
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    await createContact(
      person.firstName || '',
      person.lastName || '',
      person.phoneNumber
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// POST /api/contacts/create-bulk - Create multiple contacts
contactsRouter.post('/create-bulk', async (req, res) => {
  try {
    const { personIds } = req.body as { personIds: number[] };
    const people = db.select().from(schema.people).where(inArray(schema.people.id, personIds)).all();

    const results = [];
    for (const person of people) {
      try {
        await createContact(
          person.firstName || '',
          person.lastName || '',
          person.phoneNumber
        );
        results.push({ personId: person.id, success: true });
      } catch (error) {
        results.push({
          personId: person.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      total: people.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('Error creating contacts:', error);
    res.status(500).json({ error: 'Failed to create contacts' });
  }
});
