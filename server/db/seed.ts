import type {BetterSQLite3Database} from 'drizzle-orm/better-sqlite3'

import * as schema from './schema.js'

// Fake data for an empty database: PR test environments and local agent runs (ADR 0043). Never a
// copy of anyone real. Every phone number is in the fictional 555-0100–0199 range, so a leaked
// send could never reach a person.
//
// Written against the Drizzle schema on purpose: when a column it fills is renamed or removed,
// this stops compiling. A new table or feature should add rows here in the same change.
//
// Not seeded yet (pages open empty): hymns, music schedules, quotes, prayer sheets, Sunday School
// rolls and stats, workers' notes, fair booth, calendar print, events story, sermons.

type Db = BetterSQLite3Database<typeof schema>

const FIRST = [
  'Aaron',
  'Abigail',
  'Benjamin',
  'Bethany',
  'Caleb',
  'Charity',
  'Daniel',
  'Deborah',
  'Elijah',
  'Esther',
  'Gideon',
  'Grace',
  'Hannah',
  'Isaac',
  'Joanna',
  'Jonah',
  'Lydia',
  'Micah',
  'Miriam',
  'Nathan',
  'Naomi',
  'Phoebe',
  'Priscilla',
  'Reuben',
  'Ruth',
  'Samuel',
  'Sarah',
  'Silas',
  'Tabitha',
  'Timothy',
]
const LAST = ['Archer', 'Baker', 'Carter', 'Dawson', 'Ellis', 'Fletcher', 'Garner', 'Hollis', 'Irwin', 'Jarvis']

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sqlDateTime = (d: Date) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`

export function fakePhone(i: number): {e164: string; display: string} {
  const line = 100 + (i % 100) // 0100–0199
  return {e164: `+1202555${String(line).padStart(4, '0')}`, display: `(202) 555-${String(line).padStart(4, '0')}`}
}

function sundaysOfMonth(year: number, month0: number): string[] {
  const out: string[] = []
  const d = new Date(year, month0, 1)
  while (d.getMonth() === month0) {
    if (d.getDay() === 0) out.push(isoDate(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function isEmpty(db: Db): boolean {
  return db.select({id: schema.people.id}).from(schema.people).limit(1).all().length === 0
}

export function seedDatabase(db: Db, today = new Date()): void {
  db.transaction((tx) => {
    // --- Service times (server/db/index.ts also seeds these on boot; repeated for tests) -------
    if (tx.select().from(schema.serviceTimes).all().length === 0) {
      tx.insert(schema.serviceTimes)
        .values([
          {name: 'Sunday 9:45am', dayOfWeek: 0, time: '09:45', sortOrder: 1},
          {name: 'Sunday 11:00am', dayOfWeek: 0, time: '11:00', sortOrder: 2},
          {name: 'Sunday 6:30pm', dayOfWeek: 0, time: '18:30', sortOrder: 3},
          {name: 'Wednesday 7:30pm', dayOfWeek: 3, time: '19:30', sortOrder: 4},
        ])
        .run()
    }
    const services = tx.select().from(schema.serviceTimes).all()
    const sunday11 = services.find((s) => s.time === '11:00') ?? services[0]
    const sunday945 = services.find((s) => s.time === '09:45') ?? services[0]
    const sunday630 = services.find((s) => s.time === '18:30') ?? services[0]

    // --- People -------------------------------------------------------------------------------
    const people = FIRST.map((firstName, i) => {
      const phone = fakePhone(i)
      return tx
        .insert(schema.people)
        .values({
          firstName,
          lastName: LAST[i % LAST.length],
          phoneNumber: phone.e164,
          phoneDisplay: phone.display,
          status: i === 28 ? 'inactive' : i === 29 ? 'do_not_contact' : 'active',
          birthMonth: (i % 12) + 1,
          birthDay: (i % 27) + 1,
          birthYear: 1960 + i,
          isPreacher: i === 0,
        })
        .returning()
        .get()
    })
    // A birthday today, so the Home birthday surfaces have something to show.
    tx.insert(schema.people)
      .values({
        firstName: 'Birthday',
        lastName: 'Today',
        phoneNumber: fakePhone(40).e164,
        phoneDisplay: fakePhone(40).display,
        birthMonth: today.getMonth() + 1,
        birthDay: today.getDate(),
      })
      .run()

    // --- Groups and households ----------------------------------------------------------------
    const groupDefs = [
      {name: 'Prayer Warriors', description: 'Prayer chain', members: people.slice(0, 15)},
      {name: 'Choir', description: null, members: people.slice(5, 17)},
      {name: 'Nursery Workers', description: null, members: people.slice(10, 18)},
      {name: 'Ushers', description: null, members: people.slice(18, 24)},
      {name: 'Youth Parents', description: null, members: people.slice(20, 28)},
    ]
    const groups = groupDefs.map((g) => {
      const row = tx.insert(schema.groups).values({name: g.name, description: g.description}).returning().get()
      tx.insert(schema.peopleGroups)
        .values(g.members.map((p) => ({personId: p.id, groupId: row.id})))
        .run()
      return row
    })
    for (let h = 0; h < 6; h++) {
      const household = tx
        .insert(schema.households)
        .values({name: `The ${LAST[h]} Family`})
        .returning()
        .get()
      const members = people.filter((_, i) => i % LAST.length === h).slice(0, 3)
      tx.insert(schema.householdMembers)
        .values(members.map((p) => ({householdId: household.id, personId: p.id})))
        .run()
    }

    // --- Templates and global variables -------------------------------------------------------
    const prayerChain = tx
      .insert(schema.templates)
      .values({name: 'Prayer Chain', content: 'Prayer Warriors, please pray for {{need}}. Thank you, {{firstName}}!'})
      .returning()
      .get()
    tx.insert(schema.templates)
      .values([
        {name: 'Service Reminder', content: 'Hi {{firstName}}, see you Sunday at {{serviceTime}}!'},
        {name: 'Thank You', content: 'Thank you for serving, {{firstName}}.'},
      ])
      .run()
    tx.insert(schema.globalVariables)
      .values([
        {name: 'serviceTime', value: '11:00am'},
        {name: 'churchName', value: 'Example Baptist Church'},
      ])
      .run()

    // --- Messages: one sent, one scheduled, and a draft ---------------------------------------
    const prayer = groups[0]
    const prayerMembers = groupDefs[0].members
    const sentAt = new Date(today.getTime() - 3 * 86400_000)
    const sent = tx
      .insert(schema.messages)
      .values({
        content: 'Prayer Warriors, please pray for {{need}}. Thank you, {{firstName}}!',
        totalRecipients: prayerMembers.length,
        sentCount: prayerMembers.length - 1,
        failedCount: 1,
        status: 'completed',
        createdAt: sqlDateTime(sentAt),
        completedAt: sqlDateTime(sentAt),
      })
      .returning()
      .get()
    tx.insert(schema.messageGroups).values({messageId: sent.id, groupId: prayer.id}).run()
    tx.insert(schema.messageRecipients)
      .values(
        prayerMembers.map((p, i) => ({
          messageId: sent.id,
          personId: p.id,
          renderedContent: `Prayer Warriors, please pray for the Hollis family. Thank you, ${p.firstName}!`,
          status: i === 0 ? ('failed' as const) : ('sent' as const),
          errorMessage: i === 0 ? 'Seed data: example failure' : null,
          sentAt: i === 0 ? null : sqlDateTime(sentAt),
        })),
      )
      .run()

    const choir = groups[1]
    const choirMembers = groupDefs[1].members
    const scheduledFor = new Date(today.getTime() + 2 * 86400_000)
    const scheduled = tx
      .insert(schema.messages)
      .values({
        content: 'Hi {{firstName}}, choir practice is Wednesday at 6:30pm.',
        totalRecipients: choirMembers.length,
        status: 'scheduled',
        scheduledAt: scheduledFor.toISOString(),
      })
      .returning()
      .get()
    tx.insert(schema.messageGroups).values({messageId: scheduled.id, groupId: choir.id}).run()
    tx.insert(schema.messageRecipients)
      .values(
        choirMembers.map((p) => ({
          messageId: scheduled.id,
          personId: p.id,
          renderedContent: `Hi ${p.firstName}, choir practice is Wednesday at 6:30pm.`,
        })),
      )
      .run()

    const draft = tx
      .insert(schema.drafts)
      .values({
        name: 'Usher meeting',
        content: 'Hi {{firstName}}, quick usher meeting after the evening service.',
        createdAt: sqlDateTime(new Date(today.getTime() - 4 * 86400_000)),
      })
      .returning()
      .get()
    tx.insert(schema.draftGroups).values({draftId: draft.id, groupId: groups[3].id}).run()
    tx.insert(schema.settings)
      .values([
        {key: 'prayerRequest.groupId', value: String(prayer.id)},
        {key: 'prayerRequest.templateId', value: String(prayerChain.id)},
      ])
      .onConflictDoNothing()
      .run()

    // --- Devotions and the Passage Pool -------------------------------------------------------
    const refs = [
      'John 3:16',
      'Romans 8:28',
      'Psalm 23:1-3',
      'Proverbs 3:5-6',
      'Philippians 4:6-7',
      'Isaiah 40:31',
      'Matthew 6:33',
      'Hebrews 11:1',
      'James 1:2-4',
      '1 John 1:9',
      'Ephesians 2:8-9',
      'Joshua 1:9',
    ]
    const types = ['original', 'revisit', 'favorite', 'guest'] as const
    const devotionStart = new Date(today.getTime() - 20 * 86400_000)
    for (let i = 0; i < 24; i++) {
      const date = new Date(devotionStart.getTime() + i * 86400_000)
      const devotionType = types[i % types.length]
      tx.insert(schema.devotions)
        .values({
          date: isoDate(date),
          number: 1000 + i,
          devotionType,
          guestSpeaker: devotionType === 'guest' ? (i % 8 === 3 ? 'Tyler' : 'Gabe') : null,
          bibleReference: refs[i % refs.length],
          title: `Example devotion ${1000 + i}`,
          talkingPoints: '- First point\n- Second point\n- Third point',
          produced: i < 18,
          youtube: i < 15,
        })
        .run()
    }
    tx.insert(schema.generatedPassages)
      .values(
        [
          ['Strength for the Weary', 'Isaiah 40:29-31', true],
          ['Peace That Guards the Heart', 'Philippians 4:7', false],
          ['Rooted in Love', 'Ephesians 3:17-19', false],
          ['The Shepherd Who Restores', 'Psalm 23:3', false],
          ['Faith That Endures', 'Hebrews 12:1-2', false],
        ].map(([title, bibleReference, recorded]) => ({
          title: title as string,
          bibleReference: bibleReference as string,
          talkingPoints: '- A seed talking point\n- Another seed point\n- A closing seed point',
          recorded: recorded as boolean,
        })),
      )
      .run()

    // --- Nursery: workers and this month's schedule ------------------------------------------
    const nurseryPeople = groupDefs[2].members
    const workers = nurseryPeople.map((p) =>
      tx.insert(schema.nurseryWorkers).values({personId: p.id}).returning().get(),
    )
    for (const w of workers) {
      tx.insert(schema.nurseryWorkerServices).values({workerId: w.id, serviceTimeId: sunday11.id}).run()
    }
    const year = today.getFullYear()
    const month0 = today.getMonth()
    const nurserySchedule = tx
      .insert(schema.schedules)
      .values({
        scheduleType: 'nursery',
        scopeKind: 'monthly',
        month: month0 + 1,
        year,
        scopeLabel: today.toLocaleString('en-US', {month: 'long', year: 'numeric'}),
      })
      .returning()
      .get()
    sundaysOfMonth(year, month0).forEach((date, i) => {
      for (const slot of [1, 2]) {
        tx.insert(schema.nurseryAssignments)
          .values({
            scheduleId: nurserySchedule.id,
            date,
            serviceTimeId: sunday11.id,
            slot,
            workerId: workers[(i * 2 + slot) % workers.length].id,
          })
          .run()
      }
    })

    // --- Special music -----------------------------------------------------------------------
    sundaysOfMonth(year, month0)
      .slice(0, 3)
      .forEach((date, i) => {
        const sm = tx
          .insert(schema.specialMusic)
          .values({
            date,
            serviceTimeId: i === 2 ? sunday630.id : sunday11.id,
            songTitle: ['Great Is Thy Faithfulness', 'It Is Well', 'Amazing Grace'][i],
            type: i === 0 ? 'solo' : 'duet',
            status: date < isoDate(today) ? 'performed' : 'will_perform',
          })
          .returning()
          .get()
        tx.insert(schema.specialMusicPerformers)
          .values(
            people.slice(5 + i * 2, 5 + i * 2 + (i === 0 ? 1 : 2)).map((p, ordering) => ({
              specialMusicId: sm.id,
              personId: p.id,
              ordering,
            })),
          )
          .run()
      })

    // --- Attendance: the last six Sundays ----------------------------------------------------
    const recorder = tx
      .insert(schema.recorders)
      .values({name: 'Example Usher', token: 'seed-recorder-token'})
      .returning()
      .get()
    for (let w = 1; w <= 6; w++) {
      const d = new Date(today)
      d.setDate(d.getDate() - d.getDay() - 7 * (w - 1))
      for (const svc of [sunday945, sunday11, sunday630]) {
        tx.insert(schema.serviceRecords)
          .values({
            serviceTimeId: svc.id,
            serviceDate: isoDate(d),
            attendance: 60 + ((w * 17 + svc.id * 7) % 50),
            streaming: 10 + ((w * 5 + svc.id) % 15),
            latestRecorderId: recorder.id,
            latestRecorderName: recorder.name,
          })
          .onConflictDoNothing()
          .run()
      }
    }

    // --- RSVP ---------------------------------------------------------------------------------
    const rsvp = tx
      .insert(schema.rsvpLists)
      .values({
        name: 'Fellowship Dinner',
        standaloneTitle: 'Fellowship Dinner',
        standaloneDate: isoDate(new Date(today.getTime() + 10 * 86400_000)),
        standaloneTime: '17:00',
      })
      .returning()
      .get()
    tx.insert(schema.rsvpEntries)
      .values(
        people.slice(0, 10).map((p, i) => ({
          rsvpListId: rsvp.id,
          personId: p.id,
          status: (['yes', 'no', 'maybe', 'no_response'] as const)[i % 4],
          headcount: i % 4 === 0 ? 2 : null,
          publicToken: `seed-rsvp-${p.id}`,
        })),
      )
      .run()
  })
}
