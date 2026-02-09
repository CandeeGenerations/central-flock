import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { parseCSV, type ParsedPerson } from '../services/csv-parser.js';
import { eq } from 'drizzle-orm';

export const importRouter = Router();

// POST /api/import/preview - Parse CSV and return preview
importRouter.post('/preview', async (req, res) => {
  try {
    const { csvData } = req.body as { csvData: string };
    const parsed = parseCSV(csvData);

    // Check for duplicates against existing database
    const existingPeople = db.select({ phoneNumber: schema.people.phoneNumber }).from(schema.people).all();
    const existingPhones = new Set(existingPeople.map(p => p.phoneNumber));

    const preview = parsed.map(person => ({
      ...person,
      isDuplicate: existingPhones.has(person.phoneNumber),
    }));

    const uniqueGroups = [...new Set(parsed.flatMap(p => p.groups))].sort();

    res.json({
      people: preview,
      totalPeople: parsed.length,
      duplicates: preview.filter(p => p.isDuplicate).length,
      uniqueGroups,
      groupCount: uniqueGroups.length,
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    res.status(400).json({ error: 'Failed to parse CSV' });
  }
});

// POST /api/import/execute - Execute import
importRouter.post('/execute', async (req, res) => {
  try {
    const { people: importPeople, skipDuplicates = true } = req.body as {
      people: ParsedPerson[];
      skipDuplicates?: boolean;
    };

    let peopleCreated = 0;
    let peopleUpdated = 0;
    let peopleSkipped = 0;
    let groupsCreated = 0;
    let membershipsCreated = 0;

    // Collect all unique groups and ensure they exist
    const allGroups = [...new Set(importPeople.flatMap(p => p.groups))];
    const groupMap = new Map<string, number>();

    for (const groupName of allGroups) {
      if (!groupName) continue;
      const existing = db.select().from(schema.groups).where(eq(schema.groups.name, groupName)).get();
      if (existing) {
        groupMap.set(groupName, existing.id);
      } else {
        const newGroup = db.insert(schema.groups).values({ name: groupName }).returning().get();
        groupMap.set(groupName, newGroup.id);
        groupsCreated++;
      }
    }

    // Import people
    for (const person of importPeople) {
      const existing = db.select().from(schema.people).where(eq(schema.people.phoneNumber, person.phoneNumber)).get();

      let personId: number;

      if (existing) {
        if (skipDuplicates) {
          peopleSkipped++;
          personId = existing.id;
        } else {
          // Update existing
          db.update(schema.people).set({
            firstName: person.firstName || existing.firstName,
            lastName: person.lastName || existing.lastName,
            phoneDisplay: person.phoneDisplay || existing.phoneDisplay,
            status: person.status,
          }).where(eq(schema.people.id, existing.id)).run();
          peopleUpdated++;
          personId = existing.id;
        }
      } else {
        const newPerson = db.insert(schema.people).values({
          firstName: person.firstName || null,
          lastName: person.lastName || null,
          phoneNumber: person.phoneNumber,
          phoneDisplay: person.phoneDisplay || null,
          status: person.status,
        }).returning().get();
        peopleCreated++;
        personId = newPerson.id;
      }

      // Create group memberships
      for (const groupName of person.groups) {
        const groupId = groupMap.get(groupName);
        if (!groupId) continue;

        try {
          db.insert(schema.peopleGroups).values({ personId, groupId }).run();
          membershipsCreated++;
        } catch {
          // Ignore duplicate membership errors
        }
      }
    }

    res.json({
      peopleCreated,
      peopleUpdated,
      peopleSkipped,
      groupsCreated,
      membershipsCreated,
    });
  } catch (error) {
    console.error('Error executing import:', error);
    res.status(500).json({ error: 'Failed to execute import' });
  }
});
