# CLAUDE.md

## Project Overview

Central Flock is a macOS desktop app for managing contacts and sending personalized bulk SMS via the native Messages app. Full-stack TypeScript monorepo with React frontend and Express backend using SQLite.

## Commands

- `pnpm dev` — Start frontend (Vite, port 5173) and backend (Express, port 5172) concurrently
- `pnpm build` — TypeScript compile + Vite production build
- `pnpm lint` — Run ESLint + TypeScript type checking (both `tsconfig.app.json` and `tsconfig.server.json`)
- `pnpm db:generate` — Generate Drizzle migration files
- `pnpm db:migrate` — Push schema changes to SQLite database
- `pnpm db:studio` — Open Drizzle Studio for visual DB management

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

Schema is in `server/db/schema.ts` using Drizzle ORM. Tables: `people`, `groups`, `people_groups` (junction), `messages`, `message_recipients`, `drafts`. SQLite with WAL mode and foreign keys enabled (`server/db/index.ts`). After schema changes, run `pnpm db:migrate` to push.

## Key Patterns

- API client with typed helpers in `src/lib/api.ts`
- Express routes in `server/routes/` (people, groups, messages, drafts, import, contacts)
- Message sending is async with batch processing via `server/services/message-queue.ts`
- Template variables: `{{firstName}}`, `{{lastName}}`, `{{fullName}}`
- Phone numbers stored in E.164 format, validated as 10-digit US numbers
