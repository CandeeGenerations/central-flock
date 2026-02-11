# Message Templates Feature — Implementation Plan

## Context

Central Flock supports inline template variables (`{{firstName}}`, `{{lastName}}`, `{{fullName}}`) in the compose page, but there's no way to save and reuse message patterns. Users want a reusable template library with typed custom variables — including **date variables** where the user picks a specific date and format at compose time (e.g. "March 7th" vs "March 7, 2026").

## Scope

- **Reusable template library** — standalone templates (no recipients/scheduling), selectable at compose time to pre-fill message content
- **Typed custom variables** — each custom variable is either `text` (free-form input) or `date` (date picker + format selector)
- **User-selected dates with format control** — date variables show a calendar picker and format dropdown at compose time; the frontend resolves the formatted string and sends it to the backend
- **No built-in auto-resolved date variables** — all date handling is explicit via date-type custom variables

---

## 1. Database: Add `templates` table

**File:** `server/db/schema.ts` — add after the `drafts` table (already partially done)

```ts
export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  content: text('content').default('').notNull(),
  customVariables: text('custom_variables'), // JSON: Array<{name: string, type: "text" | "date"}>
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})
```

`customVariables` example: `[{"name":"eventName","type":"text"},{"name":"eventDate","type":"date"}]`

Run `pnpm db:migrate` after.

---

## 2. Backend: Templates CRUD routes

**New file:** `server/routes/templates.ts`

Endpoints following existing patterns (modeled after `server/routes/drafts.ts`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/templates` | List all. Optional `?search=` filters by name/content. Ordered by `updatedAt` desc. |
| `GET` | `/api/templates/:id` | Get single template by ID. |
| `POST` | `/api/templates` | Create. Body: `{name, content, customVariables?}` |
| `PUT` | `/api/templates/:id` | Update. Sets `updatedAt` to now. |
| `POST` | `/api/templates/delete` | Bulk delete. Body: `{ids: number[]}` |

**Modify:** `server/index.ts` — import and register `templatesRouter` at `/api/templates`

---

## 3. Backend: Extend `renderTemplate()`

**File:** `server/routes/messages.ts` — modify `renderTemplate()` (line 255)

Add a `customVarValues?: Record<string, string>` parameter. After existing person-variable replacements, iterate `customVarValues` entries and replace `{{varName}}` with the value.

**No date logic on the backend** — date variables arrive as pre-formatted strings from the frontend (e.g. the frontend sends `{"eventDate": "March 7, 2026"}` and the backend just replaces `{{eventDate}}`).

Update the `POST /send` handler to accept `customVarValues` from the request body and pass it through to all `renderTemplate()` calls.

---

## 4. API Client: Template types and functions

**File:** `src/lib/api.ts` — add at end of file

```ts
export interface TemplateVariable {
  name: string
  type: 'text' | 'date'
}

export interface Template {
  id: number
  name: string
  content: string
  customVariables: string | null  // JSON string of TemplateVariable[]
  createdAt: string
  updatedAt: string
}
```

Functions: `fetchTemplates`, `fetchTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplates`

Extend `sendMessage` to accept optional `customVarValues?: Record<string, string>` and include it in the request body.

---

## 5. Frontend: Templates list page

**New file:** `src/pages/templates-page.tsx`

Table following the same structure as the Drafts tab in `src/pages/message-history-page.tsx`:

- Columns: **Name**, **Content** (truncated 80 chars), **Variables** (badges showing name + type icon), **Last Updated**
- Search bar filtering by name/content
- Bulk delete with checkboxes + confirm dialog
- "Create Template" button → `/templates/new`
- Row click → `/templates/:id/edit`

---

## 6. Frontend: Template create/edit page

**New file:** `src/pages/template-edit-page.tsx`

Serves `/templates/new` and `/templates/:id/edit`.

### Form fields:

1. **Name** — `<Input>` (required)

2. **Variable insert buttons** — two groups:
   - **Person:** `{{firstName}}`, `{{lastName}}`, `{{fullName}}`
   - **Custom:** dynamically rendered button per defined custom variable

3. **Message body** — `<Textarea>`

4. **Custom variables section:**
   - Name input + type selector (`Text` / `Date`) + "Add" button
   - Validation: alphanumeric/camelCase (`/^[a-zA-Z][a-zA-Z0-9]*$/`), reject reserved names (`firstName`, `lastName`, `fullName`)
   - Displayed as removable badges with type indicator (calendar icon for date, text icon for text)

5. **Preview card:**
   - Person vars → sample data ("John Doe")
   - Text vars → `[varName]` placeholders
   - Date vars → today's date formatted via `format(new Date(), 'MMMM d, yyyy')` from `date-fns` (sample)

---

## 7. Frontend: Compose page integration

**File:** `src/pages/message-compose-page.tsx`

### Changes:

1. **Template selector** — `<Select>` dropdown above the message editor. On selection:
   - Copies template `content` into textarea
   - Parses `customVariables` JSON and stores in state

2. **Variable value inputs** — rendered per custom variable when a template is active:
   - **Text variables** → `<Input>` with label
   - **Date variables** → `<Calendar>` in `<Popover>` (reuse existing `src/components/ui/calendar.tsx` + `src/components/ui/popover.tsx`) + format `<Select>` dropdown

3. **Date format options** (preset list, using `date-fns` `format()`):

   | Label | `date-fns` format string | Example |
   |-------|--------------------------|---------|
   | March 7 | `MMMM d` | March 7 |
   | March 7th | `MMMM do` | March 7th |
   | March 7, 2026 | `MMMM d, yyyy` | March 7, 2026 |
   | 3/7/2026 | `M/d/yyyy` | 3/7/2026 |
   | Saturday, March 7 | `EEEE, MMMM d` | Saturday, March 7 |
   | Saturday, March 7, 2026 | `EEEE, MMMM d, yyyy` | Saturday, March 7, 2026 |

4. **Extended variable insert buttons** — add custom var buttons from active template

5. **Extended preview** — person vars with first recipient data, text vars from input (or `[varName]` if empty), date vars formatted with selected date + format (or `[varName]` if no date picked)

6. **Send mutation** — frontend formats each date variable using the picked date + format into a plain string, builds `customVarValues: Record<string, string>`, passes to `sendMessage()`

### New state:
```ts
const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({})  // for text vars
const [dateValues, setDateValues] = useState<Record<string, Date | undefined>>({})  // raw Date per date var
const [dateFormats, setDateFormats] = useState<Record<string, string>>({})           // format key per date var
```

At send time, date vars are resolved: `format(dateValues[name], dateFormats[name])` (from `date-fns`) → string, merged into `customVarValues`.

---

## 8. Navigation and routing

**File:** `src/App.tsx`

- Add `{to: '/templates', label: 'Templates', icon: FileText}` to `navItems` (between Messages and Import)
- Import `FileText` from `lucide-react`
- Add routes: `/templates`, `/templates/new`, `/templates/:id/edit`
- Import `TemplatesPage` and `TemplateEditPage`

---

## Files Summary

| Action | File |
|--------|------|
| Modify | `server/db/schema.ts` — add `templates` table (already partially done) |
| Create | `server/routes/templates.ts` — CRUD routes |
| Modify | `server/index.ts` — register templates router |
| Modify | `server/routes/messages.ts` — extend `renderTemplate()` with `customVarValues` param |
| Modify | `src/lib/api.ts` — add Template types/functions, extend `sendMessage` |
| Create | `src/pages/templates-page.tsx` — list page |
| Create | `src/pages/template-edit-page.tsx` — create/edit page |
| Modify | `src/pages/message-compose-page.tsx` — template selector, typed variable inputs, date picker + format |
| Modify | `src/lib/date.ts` — refactor to use `date-fns` for all date formatting |
| Modify | `src/App.tsx` — nav item + routes |

## Key reusable components

- `src/components/ui/calendar.tsx` — `Calendar` (react-day-picker) for date picking
- `src/components/ui/popover.tsx` — `Popover` wrapper for calendar dropdown
- `src/components/ui/select.tsx` — `Select` for template selector and date format dropdown
- `src/components/confirm-dialog.tsx` — `ConfirmDialog` for delete confirmation
- `src/lib/date.ts` — refactor to use `date-fns` (see below)

## Prerequisite: Migrate `src/lib/date.ts` to `date-fns`

`date-fns` is already installed (`^4.1.0`) but unused. Refactor `src/lib/date.ts` to use it:

```ts
import {format} from 'date-fns'

export function parseUTC(dateStr: string): Date {
  if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr)
  }
  return new Date(dateStr + 'Z')
}

export function formatDate(dateStr: string): string {
  return format(parseUTC(dateStr), 'M/d/yyyy')
}

export function formatDateTime(dateStr: string): string {
  return format(parseUTC(dateStr), 'M/d/yyyy h:mm a')
}
```

This also gives the templates feature a consistent date library to build on — the compose page date formatting uses `format(date, pattern)` from the same library.

## Verification

1. `pnpm db:migrate` after schema change
2. `pnpm lint` to verify no type errors
3. Create a template with text + date custom variables
4. In compose, select the template → verify content pre-fills, text inputs and date pickers appear
5. Pick a date, change format dropdown → verify preview updates with correctly formatted date
6. Send a test message → check message detail page to confirm `renderedContent` has all variables resolved
