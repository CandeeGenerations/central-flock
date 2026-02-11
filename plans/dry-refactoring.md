# DRY Refactoring Plan

## Context

The codebase has accumulated significant code duplication across both frontend and backend — identical utility logic copy-pasted across pages, repeated error handling boilerplate in every route, and magic strings scattered throughout. This plan consolidates the highest-impact duplications into shared utilities, reducing ~250 lines of repeated code.

---

## Step 1: Shared Frontend Utilities

Create foundational utilities that most pages will import.

### 1a. Create `src/lib/format.ts` — Full name + template rendering

```typescript
export function formatFullName(
  person: {firstName?: string | null; lastName?: string | null},
  fallback = 'Unnamed',
): string

export function renderTemplate(
  template: string,
  person: {firstName?: string | null; lastName?: string | null},
): string
```

**Replaces:** 13 inline `[p.firstName, p.lastName].filter(Boolean).join(' ')` occurrences + inline template rendering in `message-compose-page.tsx:131-137`

**Files to modify:** `message-compose-page.tsx`, `message-detail-page.tsx`, `group-detail-page.tsx`, `person-detail-page.tsx`

### 1b. Create `src/hooks/use-set-toggle.ts` — Set toggle hook

```typescript
export function useSetToggle<T>(setItems: Dispatch<SetStateAction<Set<T>>>): (item: T) => void
```

**Replaces:** 5 identical toggle functions across `message-history-page.tsx` (2x), `message-compose-page.tsx` (2x), `group-detail-page.tsx`

### 1c. Create `src/lib/query-keys.ts` — Centralized query key constants

```typescript
export const queryKeys = {
  people: ['people'] as const,
  person: (id: string | number) => ['person', String(id)] as const,
  groups: ['groups'] as const,
  group: (id: string | number) => ['group', String(id)] as const,
  messages: (search?: string) => ['messages', search] as const,
  message: (id: string | number) => ['message', String(id)] as const,
  drafts: (search?: string) => ['drafts', search] as const,
  draft: (id: number) => ['draft', id] as const,
  nonMembers: (groupId: string | number, search?: string) => ['nonMembers', String(groupId), search] as const,
}
```

**Replaces:** 15+ magic string query keys scattered across all page files

**Files to modify:** All 7 page files in `src/pages/`

---

## Step 2: Backend Route Helpers

### Create `server/lib/route-helpers.ts`

```typescript
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response) => void
export function getGroupName(groupId: number): string | null
export function isUniqueConstraintError(error: unknown): boolean
```

- **`asyncHandler`** — Wraps route handlers with try-catch, eliminating ~30 identical try-catch blocks across all route files
- **`getGroupName`** — Replaces 4 identical DB queries in `messages.ts` and `drafts.ts`
- **`isUniqueConstraintError`** — Replaces 2 identical constraint checks in `people.ts` and `groups.ts`

### Create `server/lib/format.ts` — Backend full name + template rendering

Move `renderTemplate` from `server/routes/messages.ts:255-263` to shared location. Add `formatFullName` for consistency.

**Files to modify:** `server/routes/people.ts`, `server/routes/groups.ts`, `server/routes/messages.ts`, `server/routes/drafts.ts`

---

## Step 3: API Query String Builder

### Modify `src/lib/api.ts`

Add a helper to build URL query strings:

```typescript
function buildQueryString(params?: Record<string, string | number | undefined>): string
```

**Replaces:** 4 repeated URLSearchParams building blocks in `fetchPeople`, `fetchNonMembers`, `fetchMessages`, `fetchDrafts`

---

## Step 4: Batch Settings Constants

### Create `src/lib/constants.ts` and `server/lib/constants.ts`

```typescript
export const BATCH_DEFAULTS = { batchSize: 1, batchDelayMs: 5000 } as const
```

**Replaces:** Hardcoded `1` and `5000` in `message-compose-page.tsx`, `server/routes/messages.ts`, `server/routes/drafts.ts`

---

## Step 5: Local Query Invalidation Helpers

Extract repeated invalidation blocks into per-component helpers (not new files):

- **`group-detail-page.tsx`** — `invalidateGroupMembership()` replacing 3 identical 3-line blocks
- **`person-detail-page.tsx`** — `invalidatePersonMembership()` replacing 3 identical 3-line blocks

---

## Step 6: Align Phone Normalization

Add a comment in `server/services/csv-parser.ts:normalizePhoneNumber` documenting it mirrors `src/lib/utils.ts:phoneToE164`. Align the edge-case behavior (return `''` instead of the original string for unparseable input). Not worth a shared directory for 7 lines.

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/lib/format.ts` | `formatFullName()`, `renderTemplate()` |
| `src/lib/query-keys.ts` | Centralized query key constants |
| `src/lib/constants.ts` | `BATCH_DEFAULTS` |
| `src/hooks/use-set-toggle.ts` | `useSetToggle()` hook |
| `server/lib/format.ts` | `formatFullName()`, `renderTemplate()` |
| `server/lib/route-helpers.ts` | `asyncHandler()`, `getGroupName()`, `isUniqueConstraintError()` |
| `server/lib/constants.ts` | `BATCH_DEFAULTS` |

## Modified Files Summary

| File | Key Changes |
|------|-------------|
| `src/pages/message-compose-page.tsx` | Most changes — name format, template render, set toggle, query keys, batch defaults |
| `src/pages/message-detail-page.tsx` | Name format, query keys |
| `src/pages/message-history-page.tsx` | Set toggle, query keys |
| `src/pages/group-detail-page.tsx` | Name format, set toggle, query keys, invalidation helper |
| `src/pages/person-detail-page.tsx` | Name format, query keys, invalidation helper |
| `src/pages/people-page.tsx` | Query keys |
| `src/pages/groups-page.tsx` | Query keys |
| `src/lib/api.ts` | `buildQueryString` helper |
| `server/routes/people.ts` | `asyncHandler`, `isUniqueConstraintError` |
| `server/routes/groups.ts` | `asyncHandler`, `isUniqueConstraintError` |
| `server/routes/messages.ts` | `asyncHandler`, `getGroupName`, move `renderTemplate` |
| `server/routes/drafts.ts` | `asyncHandler`, `getGroupName`, batch defaults |
| `server/services/csv-parser.ts` | Align phone normalization behavior |

## Verification

1. Run `pnpm lint` to confirm no type errors or unused imports
2. Run `pnpm build` to confirm production build succeeds
3. Run `pnpm dev` and manually test:
   - Create/edit a person (phone input still works)
   - Create/edit a group, add/remove members
   - Compose a message with template variables (preview renders correctly)
   - Send a message and check history
   - Save/load a draft
   - Delete messages/drafts in bulk
