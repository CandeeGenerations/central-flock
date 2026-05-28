# Household Merge for Special Music PDF Export

## Problem

When exporting per-recipient PDFs, each person gets their own highlighted page. People in the same household (e.g., Tyler & Carissa) want a single combined page showing both their highlighted cells so they can see at a glance when either of them is singing.

## Design Decisions

- **Persistent households** stored in DB, not ad-hoc at export time
- **New tables** (`households`, `household_members`) rather than reusing `groups`
- **One household per person** max (unique constraint on `person_id`)
- **Auto-generated name** from member first names (e.g., "Tyler & Carissa")
- **Settings UI** lives in the Special Music section of Schedules Settings
- **Member picker** filters to people in the configured singer groups only
- **Minimum 2 members** enforced in UI
- **Special music only** -- does not apply to nursery schedule exports

## Implementation

### Step 1: DB Schema

Add to `server/db/schema-music.ts`:

```ts
export const households = sqliteTable('households', {
  id: integer('id').primaryKey({autoIncrement: true}),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const householdMembers = sqliteTable(
  'household_members',
  {
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
  },
  (t) => [
    primaryKey({columns: [t.householdId, t.personId]}),
    // One household per person
    unique().on(t.personId),
  ],
)
```

Run `pnpm db:generate` then `pnpm db:migrate`.

### Step 2: API Routes

Add household CRUD to `server/routes/schedules.ts` (or a new `server/routes/households.ts` if cleaner):

**`GET /api/schedules/households`**

- Returns all households with their members (join `household_members` + `people` for first/last name)
- Response: `{ id: number, members: { personId: number, firstName: string, lastName: string }[] }[]`

**`POST /api/schedules/households`**

- Body: `{ memberIds: number[] }` (must be >= 2)
- Validates no member is already in another household (or returns 409)
- Creates household + member rows
- Returns the created household with members

**`PUT /api/schedules/households/:id`**

- Body: `{ memberIds: number[] }` (must be >= 2)
- Replaces all members (delete old rows, insert new)
- Validates uniqueness constraint

**`DELETE /api/schedules/households/:id`**

- Deletes the household (cascade deletes members)

### Step 3: Frontend API Client

Add to `src/lib/schedules-api.ts`:

```ts
export interface Household {
  id: number
  members: {personId: number; firstName: string; lastName: string}[]
}

export const fetchHouseholds = () => request<Household[]>('/schedules/households')
export const createHousehold = (memberIds: number[]) =>
  request<Household>('/schedules/households', {method: 'POST', body: JSON.stringify({memberIds})})
export const updateHousehold = (id: number, memberIds: number[]) =>
  request<Household>(`/schedules/households/${id}`, {method: 'PUT', body: JSON.stringify({memberIds})})
export const deleteHousehold = (id: number) => request<void>(`/schedules/households/${id}`, {method: 'DELETE'})
```

Add query key: `households: ['schedules', 'households'] as const`

### Step 4: Settings UI

In `src/pages/schedules-settings-page.tsx`, add a new section inside the Special Music `<Card>` (after the `TypeDefaultsCard`):

**Households section:**

- Header: "Households" with a description like "People in the same household share one highlighted page when exporting PDFs."
- List of existing households, each showing the auto-generated name (first names joined with " & ") and a delete button
- "Add Household" button that shows an inline form or small dialog with a multi-select picker
- The multi-select picker should:
  - Load people from the singer groups (use the same `singerGroupIds` to filter -- fetch group members)
  - Disable/hide people already in a household (show which household they belong to)
  - Require at least 2 selections before the save button enables

### Step 5: Merge Logic in `buildSpecialMusicRecipients`

Modify `buildSpecialMusicRecipients` in `src/pages/special-music/special-music-schedule-view-page.tsx` to accept households and merge members:

```ts
function buildSpecialMusicRecipients(cells: SpecialMusicCell[], households: Household[]): Recipient[] {
  // 1. Build individual recipients as today (byKey map)
  // 2. Build a personId -> householdId lookup from households
  // 3. After building individuals, merge household members:
  //    - For each household, find all `person:{id}` recipients whose personId is in the household
  //    - Union their cellIds and dates
  //    - Combine their first names: "Tyler & Carissa"
  //    - Use key: `household:{householdId}`
  //    - Remove the individual entries from the result
  // 4. People not in any household remain as individual recipients (unchanged)
  // 5. Guest performers and label recipients are unaffected
}
```

### Step 6: Wire Households into the View Page

In `special-music-schedule-view-page.tsx`:

1. Add a query for `fetchHouseholds()` alongside the existing settings/cells queries
2. Pass `households` to `buildSpecialMusicRecipients(cells, households)`
3. The rest of the flow (export dialog, `runPdfExport`, `exportMultiPagePdf`) needs no changes -- it already operates on the `Recipient[]` array, which now contains merged household recipients

### Step 7: Handle Edge Cases

- **Person removed from singer group but still in a household:** The household member picker should show singer group members. If a person is manually removed from the singer group but stays in the household, the merge still works (the join is by `personId` in cell data). No action needed unless the person has no cells in the schedule, in which case they contribute nothing to the merge.
- **Household member not in current schedule:** If Tyler has cells but Carissa doesn't, the merged page just shows Tyler's cells. The combined name still shows "Tyler & Carissa" as the subtitle. This is correct -- it tells the household they only have one person singing that period.
- **All household members absent from schedule:** The household doesn't appear in the recipient list at all (no cells = no recipient). This is the correct behavior -- same as an individual with no assignments.

## Files Changed

| File                                                           | Change                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `server/db/schema-music.ts`                                    | Add `households` and `householdMembers` tables                         |
| `server/routes/schedules.ts`                                   | Add household CRUD endpoints                                           |
| `src/lib/schedules-api.ts`                                     | Add `Household` type and fetch/create/update/delete helpers, query key |
| `src/pages/schedules-settings-page.tsx`                        | Add households management UI in Special Music section                  |
| `src/pages/special-music/special-music-schedule-view-page.tsx` | Fetch households, pass to `buildSpecialMusicRecipients`, merge logic   |
| New migration file                                             | Generated by `pnpm db:generate`                                        |
