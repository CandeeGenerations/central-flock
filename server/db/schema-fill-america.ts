import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

// Which of the four recurring slots in the year a Campaign occupies. Stored
// rather than derived from the start month so an off-month campaign can be
// filed correctly instead of silently mis-bucketed. See CONTEXT.md → Season.
export const fillAmericaSeasons = ['spring', 'summer', 'fall', 'winter'] as const
export type FillAmericaSeason = (typeof fillAmericaSeasons)[number]

// The durable participant unit — "Candees", "Harrisons", "Neil Tellier".
// Reused by every Campaign, which is what lets a family's tracts be totalled
// across four years. Deliberately NOT linked to `people`: the roster is kept by
// family, half the entries have no single contact behind them, and a contact
// link would drift from the headcount.
//
// Size is NOT here — it lives on the Roster Entry, because families grow and a
// 2024 report must still say what it said in 2024. See ADR 0033.
export const fillAmericaHouseholds = sqliteTable('fill_america_households', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull().unique(),
  active: integer('active', {mode: 'boolean'}).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// One bounded tract-and-door-hanger push. Its Campaign Weeks are derived from
// (start_date, end_date) — the count is never stored, so a four-week campaign
// needs no schema change even though every one so far has been three.
export const fillAmericaCampaigns = sqliteTable('fill_america_campaigns', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title').notNull(),
  startDate: text('start_date').notNull().unique(),
  endDate: text('end_date').notNull(),
  season: text('season', {enum: fillAmericaSeasons}).notNull(),
  // The campaign's own target, in tracts. Independent of the per-Roster-Entry
  // goals, which sum to their own total — this is what the church set out to
  // do, not what the roster added up to when everyone was asked.
  goal: integer('goal'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// One week of a Campaign. Holds exactly one typed number: door hangers, which
// are deliberately never attributed to a Household. Everything else on the week
// — tracts, unique participants — is derived from the roster.
export const fillAmericaCampaignWeeks = sqliteTable(
  'fill_america_campaign_weeks',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => fillAmericaCampaigns.id, {onDelete: 'cascade'}),
    weekNo: integer('week_no').notNull(), // 1-based
    weekDate: text('week_date').notNull(), // start_date + 7*(week_no-1)
    doorHangers: integer('door_hangers'), // nullable: blank is not zero
  },
  (t) => [uniqueIndex('fill_america_campaign_weeks_uniq').on(t.campaignId, t.weekNo)],
)

// One Household's participation in one Campaign — its Size for that campaign
// and its optional Goal. Copied forward when a new Campaign is created.
export const fillAmericaRosterEntries = sqliteTable(
  'fill_america_roster_entries',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => fillAmericaCampaigns.id, {onDelete: 'cascade'}),
    householdId: integer('household_id')
      .notNull()
      .references(() => fillAmericaHouseholds.id, {onDelete: 'cascade'}),
    // The "x 5" that used to live inside the spreadsheet's row label.
    size: integer('size').notNull().default(1),
    goal: integer('goal'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('fill_america_roster_entries_uniq').on(t.campaignId, t.householdId),
    index('fill_america_roster_entries_household_idx').on(t.householdId),
  ],
)

// The cell of the roster grid: tracts one Household distributed in one week.
// The only per-household figure captured. Nullable — blank means nothing was
// reported, and the week's tract total is the sum of these, never typed.
export const fillAmericaTractReports = sqliteTable(
  'fill_america_tract_reports',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    rosterEntryId: integer('roster_entry_id')
      .notNull()
      .references(() => fillAmericaRosterEntries.id, {onDelete: 'cascade'}),
    weekId: integer('week_id')
      .notNull()
      .references(() => fillAmericaCampaignWeeks.id, {onDelete: 'cascade'}),
    tracts: integer('tracts'),
  },
  (t) => [
    uniqueIndex('fill_america_tract_reports_uniq').on(t.rosterEntryId, t.weekId),
    index('fill_america_tract_reports_week_idx').on(t.weekId),
  ],
)
