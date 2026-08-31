import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

// Configured age band a Department Count is recorded against — "2-5yrs",
// "1st-5th", "6th-12th". Retired like a Service Time (active=false) rather than
// deleted once counts reference it.
//
// Deliberately NOT the Sunday School Roll's free-text Class: the Roll has five
// Classes split by grade AND gender, this has three age bands with gender as a
// column pair, and a chart series has to hold its identity across years where a
// Roll Sheet label is a per-quarter snapshot.
// See docs/adr/0031-sunday-school-stats-is-independent-of-service-records-and-the-roll.md.
export const sundaySchoolDepartments = sqliteTable('sunday_school_departments', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  active: integer('active', {mode: 'boolean'}).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// One cell of the stats grid: the girls and boys counted in one Department on
// one Sunday. Upserted on write, keyed by (week_of, department_id).
//
// girls/boys are nullable and blank is NOT zero — blank means nobody recorded
// it, 0 means the class met and no one came. The workbook this replaces makes
// the same distinction and the import preserves it.
export const sundaySchoolDepartmentCounts = sqliteTable(
  'sunday_school_department_counts',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    // 'YYYY-MM-DD', always a Sunday. Derived columns come from
    // sundaysInQuarter(); no quarter row is ever stored.
    weekOf: text('week_of').notNull(),
    departmentId: integer('department_id')
      .notNull()
      .references(() => sundaySchoolDepartments.id, {onDelete: 'cascade'}),
    girls: integer('girls'),
    boys: integer('boys'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('sunday_school_department_counts_week_dept_uniq').on(t.weekOf, t.departmentId),
    index('sunday_school_department_counts_week_idx').on(t.weekOf),
  ],
)
