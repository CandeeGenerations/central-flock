# Birthday Feature Plan

## Context

Central Flock needs a birthday tracking and automated messaging feature. Users want to:

- Store birthdays on person profiles (month/day, optionally with year)
- Get pre-notification reminders (3, 7, 10 days before) sent to themselves
- Automatically send birthday texts to either the person or themselves
- Track birthdays for people without phone numbers

---

## 1. Database Schema Changes

**File:** `server/db/schema.ts`

### 1a. Add birthday fields to `people` table

```ts
birthMonth: integer('birth_month'),  // 1-12
birthDay: integer('birth_day'),      // 1-31
birthYear: integer('birth_year'),    // optional, e.g. 1993
```

### 1b. Make `phoneNumber` nullable

Change `phoneNumber` from `.notNull().unique()` to `.unique()` (nullable). SQLite allows multiple NULLs in a unique column.

### 1c. Add `birthday_messages_sent` tracking table

Prevents duplicate sends on the same day. Without this, if the server restarts, it would re-send.

```ts
export const birthdayMessagesSent = sqliteTable('birthday_messages_sent', {
  id: integer('id').primaryKey({autoIncrement: true}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id, {onDelete: 'cascade'}),
  type: text('type', {enum: ['birthday', 'pre_3', 'pre_7', 'pre_10']}).notNull(),
  year: integer('year').notNull(), // the year this was sent for
  sentAt: text('sent_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

Run `pnpm db:migrate` after schema changes.

---

## 2. Birthday Settings (Backend)

**File:** `server/routes/settings.ts`

Add new settings keys with defaults:

| Key                     | Default   | Valid Values                                          |
| ----------------------- | --------- | ----------------------------------------------------- |
| `birthdaySendTime`      | `"07:00"` | HH:MM format                                          |
| `birthdayPreNotifyDays` | `""`      | Comma-separated: any combo of `3,7,10` (empty = none) |
| `birthdaySendTo`        | `"self"`  | `"self"`, `"person"`                                  |
| `birthdayMyContactId`   | `""`      | A person ID from the people table                     |

Add these to `DEFAULTS` and `VALID_VALUES` (with appropriate validation for each).

---

## 3. Birthday Settings (Frontend)

**File:** `src/pages/settings-page.tsx`

Add a new `<Card>` section titled **"Birthdays"** with:

1. **My Contact** — A searchable select (`src/components/ui/searchable-select.tsx`) to pick a person from the people table. This is who "send to myself" texts go to. Fetch people list via existing `fetchPeople()` API.

2. **Send Time** — Time-only picker. Since the existing `DateTimePicker` includes a calendar, build a simpler time-only select with hour (12h AM/PM) and minute (5-min intervals) dropdowns, matching the existing picker's pattern. Store as `"HH:MM"` (24h).

3. **Pre-notification Days** — Three checkboxes (3 days, 7 days, 10 days). Store as comma-separated string `"3,7,10"`.

4. **Send Birthday Text To** — Select with two options: "Myself" / "The Person". When "The Person" is selected, show a note: _"People without a phone number will receive the text to your contact instead."_

---

## 4. Person Profile — Birthday Input

### 4a. Backend

**File:** `server/routes/people.ts`

- Accept `birthMonth`, `birthDay`, `birthYear` on create/update
- Validate: if `birthMonth` is set, `birthDay` must also be set. `birthYear` is optional.
- Validate ranges: month 1-12, day 1-31 with per-month validation (e.g. max 29 for Feb, 30 for Apr/Jun/Sep/Nov)
- Make `phoneNumber` optional in create/update validation. Remove the frontend 10-digit requirement when phone is empty.
- When phone is null, prevent adding to groups (return 400 in `POST /api/groups/:id/members`)
- When phone is null, prevent adding as message recipient

### 4b. Frontend

**File:** `src/pages/person-detail-page.tsx`

- Add birthday fields: Month (select 1-12), Day (select 1-31), Year (optional text input)
- Make phone number field optional — remove the save button disable when phone is empty
- Show a visual indicator when person has no phone (e.g. badge or muted text)

**File:** `src/pages/people-page.tsx`

- Update inline add form to allow empty phone number
- Show birthday icon/indicator in people list for those with birthdays set

---

## 5. Birthday Scheduler Service

**New file:** `server/services/birthday-scheduler.ts`

### Core logic:

1. **Startup:** Calculate the next run time based on `birthdaySendTime` setting. Schedule a `setTimeout` for that time.
2. **Each day at send time:** Run `checkBirthdays()`, then schedule the next run for tomorrow at the same time.
3. If the setting changes, cancel the current timeout and reschedule.

### `checkBirthdays()` function:

1. Read settings: `birthdaySendTime`, `birthdayPreNotifyDays`, `birthdaySendTo`, `birthdayMyContactId`
2. If `birthdayMyContactId` is not set, log warning and skip
3. Get today's date (month/day)
4. Query all people with birthdays set

**For each person with a birthday:**

5. **Check pre-notifications** (3, 7, 10 days before):
   - Calculate if today is exactly N days before their birthday
   - Check `birthday_messages_sent` table to avoid duplicates (match personId + type + year)
   - If due and not already sent: send to self (myContactId's phone number)
   - Message: `"Reminder - 7 days till Tyler Candee's birthday!"`
   - Record in `birthday_messages_sent`

6. **Check birthday itself** (today matches birth month/day):
   - Check `birthday_messages_sent` for duplicate (type=`birthday`, year=current year)
   - Determine recipient:
     - If `birthdaySendTo === 'person'` AND person has a phone number → send to person
     - Otherwise → send to self (myContactId's phone number)
   - Message (to person): `"Happy birthday to you!"` or `"Happy 33rd birthday to you!"`
   - Message (to self): `"Happy birthday to Tyler Candee"` or `"Happy 33rd birthday to Tyler Candee"`
   - Age calculation: current year minus `birthYear`, with ordinal suffix (1st, 2nd, 3rd, 33rd, etc.)
   - Record in `birthday_messages_sent`

7. Use the existing `sendMessage` or `sendMessageViaUI` from `applescript.ts` directly (no need to create a message record in the messages table — these are system-generated, not user-composed). Respects the `sendMethod` setting (API vs UI).

### Age with ordinal suffix helper:

```ts
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
```

### Register in server startup:

**File:** `server/index.ts`

- Import and call `startBirthdayScheduler()` alongside the existing `startScheduler()`

---

## 6. Guard Phone-Required Operations

### Groups

**File:** `server/routes/groups.ts`

- In `POST /api/groups/:id/members`: validate that all `personIds` have a phone number. Return 400 for any that don't.

**File:** Frontend group member selection

- Remove people without phone numbers from the selectable dropdown/list entirely

### Messages

**File:** `server/routes/messages.ts` (and/or compose page)

- Filter out people without phone numbers from recipient lists
- Frontend: in compose page recipient selection, remove people without phone numbers from the dropdown entirely (not just disabled — fully hidden)

### Frontend guards

**File:** `src/pages/person-detail-page.tsx`

- Disable "Send Message" link when person has no phone number
- Disable "Add to Group" when person has no phone number

### General dropdown filtering

- All people-selection dropdowns across the app (groups, messages, and any other selectors) should exclude people without phone numbers, except where the context is birthday-only (e.g. the "My Contact" birthday setting selector)

---

## 7. API Types Update

**File:** `src/lib/api.ts`

Update `Person` interface:

```ts
export interface Person {
  // ... existing fields
  phoneNumber: string | null // was: string
  birthMonth: number | null
  birthDay: number | null
  birthYear: number | null
}
```

---

## File Summary

| File                                    | Change                                                            |
| --------------------------------------- | ----------------------------------------------------------------- |
| `server/db/schema.ts`                   | Add birthday fields, nullable phone, birthday_messages_sent table |
| `server/routes/settings.ts`             | Add birthday setting keys + validation                            |
| `server/routes/people.ts`               | Accept birthday fields, optional phone                            |
| `server/routes/groups.ts`               | Validate phone on member add                                      |
| `server/routes/messages.ts`             | Filter recipients without phone                                   |
| `server/services/birthday-scheduler.ts` | **New** — daily birthday check + send                             |
| `server/index.ts`                       | Start birthday scheduler                                          |
| `src/pages/settings-page.tsx`           | Birthday settings card                                            |
| `src/pages/person-detail-page.tsx`      | Birthday input, optional phone                                    |
| `src/pages/people-page.tsx`             | Optional phone in add form                                        |
| `src/pages/message-compose-page.tsx`    | Filter out phoneless people                                       |
| `src/lib/api.ts`                        | Update Person type                                                |
| `src/lib/utils.ts`                      | Possibly update phone validation helpers                          |

---

## Verification

1. **Schema:** Run `pnpm db:migrate` — confirm new columns and table created
2. **Settings:** Open Settings page → verify birthday card renders, all controls work, values persist on refresh
3. **Person profile:** Create person without phone → verify save works. Add birthday (month/day only, then with year). Verify cannot add phoneless person to group.
4. **Birthday scheduler:**
   - Set send time to 1 minute from now
   - Create a person with today's birthday
   - Set "send to self" + configure my contact
   - Wait for scheduler tick → verify message sent to self
   - Change to "send to person" → manually trigger → verify message sent to person's number
   - Verify duplicate prevention (restart server, confirm no re-send)
5. **Pre-notifications:** Set a person's birthday to 3 days from now, enable 3-day checkbox → verify reminder sent
6. **Lint:** Run `pnpm lint` — no errors
