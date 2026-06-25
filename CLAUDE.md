# CLAUDE.md

## Project Overview

Central Flock is a macOS desktop app for managing contacts and sending personalized bulk SMS via the native Messages app. Full-stack TypeScript monorepo with React frontend and Express backend using SQLite.

## Commands

- `pnpm dev` — Start frontend (Vite, port 5173) and backend (Express, port 5172) concurrently
- `pnpm build` — TypeScript compile + Vite production build
- `pnpm lint` — Run ESLint + TypeScript type checking (both `tsconfig.app.json` and `tsconfig.server.json`)
- `pnpm db:generate` — Generate Drizzle migration files
- `pnpm db:migrate` — Apply pending migration files (idempotent; ledger in `__drizzle_migrations`)
- `pnpm db:push` — Diff schema and push directly (skips migration files; dev convenience, not for prod)
- `pnpm db:studio` — Open Drizzle Studio for visual DB management

## Operations

See [RUNBOOK.md](./RUNBOOK.md) for the deploy procedure, destructive-migration handling, and rollback steps. There is no dev/test DB — production is the only DB.

## Architecture

- **Frontend:** `src/` — React 19, React Router, TailwindCSS 4, Radix UI, TanStack React Query
- **Backend:** `server/` — Express 5, Drizzle ORM, better-sqlite3
- **Database:** SQLite file at `./central-flock.db`, schema in `server/db/schema.ts`
- **API proxy:** Vite proxies `/api` requests to `http://localhost:5172` in dev
- **Path alias:** `@` maps to `./src` (configured in `vite.config.ts` and `tsconfig.app.json`)
- **macOS integration:** AppleScript in `server/services/applescript.ts` for Messages and Contacts

## Code Style

- Prettier: no semicolons, single quotes, no bracket spacing, 120 print width, 2-space indent
- Import sorting via `@trivago/prettier-plugin-sort-imports` (third-party first, then local)
- Conventional commits enforced by commitlint (`feat:`, `fix:`, `chore:`, etc.)
- Pre-commit hook runs `sort-package-json` on `package.json` via lint-staged
- TypeScript strict mode enabled for both frontend and server
- `noUnusedLocals` and `noUnusedParameters` enabled on server tsconfig

## Database

Schema is in `server/db/schema.ts` using Drizzle ORM. Tables: `people`, `groups`, `people_groups` (junction), `messages`, `message_recipients`, `drafts`, `templates`, `global_variables`. SQLite with WAL mode and foreign keys enabled (`server/db/index.ts`). After schema changes, run `pnpm db:migrate` to push.

## Key Patterns

- API client with typed helpers in `src/lib/api.ts`
- Express routes in `server/routes/` (people, groups, messages, drafts, templates, global-variables, import, contacts)
- Message sending is async with batch processing via `server/services/message-queue.ts`
- Template variables: `{{firstName}}`, `{{lastName}}`, `{{fullName}}`
- Phone numbers stored in E.164 format, validated as 10-digit US numbers
- CSV import via `/api/import` (preview + execute); CSV export via `/api/people/export` and `/api/groups/:id/export`
- Command palette (Cmd+K): when adding/removing/renaming a route in `src/App.tsx` or a nav entry in `src/lib/nav-config.ts`, keep the palette in sync. Sidebar nav actions are derived from `navGroups` in `src/lib/search/actions.ts` (so sidebar routes update automatically); non-sidebar routes need an explicit entry there. New searchable entities get a provider in `src/lib/search/providers/` (registered in `providers/index.ts`); a new group also needs `GROUP_ORDER` + `PREFIX_TO_GROUP` in `src/components/command-palette.tsx`.
- Usage frecency / Recents: route visits are logged (`route_visits` table) by the shell hook `use-route-visit-logger`; sections reorder Navigation and frecent entities feed the Recent group via `/api/usage/*`. When you add a new entity detail route (`/section/:id`), add a pretty-label entry for its section in `server/services/usage-entity-resolver.ts` — without one it still works but shows a generic "Section #id" label (a dev-only console warning flags the gap). If the entity can also appear in Recents, set `navPath` on its provider items so the Recent entry de-dupes against the provider result.
