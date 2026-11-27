# Seed data

A sandbox starts with an empty database. `pnpm start` runs `pnpm db:seed`, which fills it with fake
data from `server/db/seed.ts` so every section can be clicked through. It does nothing outside a
sandbox, or when the database already has people in it, so production is never touched.

To run it locally:

```bash
export CENTRAL_FLOCK_SANDBOX=1 CENTRAL_FLOCK_DB_PATH=/tmp/test.db
pnpm db:migrate && pnpm db:seed
```

## Use

- **A new table or feature adds seed rows in the same change**, in `seedDatabase()`, and a count
  check in `server/db/seed.test.ts`. If a section is left empty on purpose, add it to the "Not
  seeded yet" list at the top of `seed.ts`.
- **Write against the Drizzle schema** (`db.insert(schema.x).values(...)`), never raw SQL, so a
  renamed or removed column stops the seed compiling.
- **Phone numbers come from `fakePhone(i)`** only: the fictional 555-0100–0199 range. The test
  fails on any other number.
- **Dates are relative to `today`** (the function's parameter), so the data always looks current
  and the test can pin a date.

Example:

```ts
// server/db/seed.ts
// A birthday today, so the Home birthday surfaces have something to show.
tx.insert(schema.people)
  .values({
    firstName: 'Birthday',
    lastName: 'Today',
    phoneNumber: fakePhone(40).e164,
    phoneDisplay: fakePhone(40).display,
    birthMonth: today.getMonth() + 1,
    birthDay: today.getDate(),
    ...
```

## Don't

- Copy anything from production: names, numbers, uploads or a database file.
- Seed settings that point outside the app: `webhookUrl`, `mattermostFallbackUrl`, or any saved
  Canva, Metricool or Notion connection. Outbound features should find nothing to call.
- Use real-looking numbers outside 555-0100–0199, even in a one-off test row.
