# Central Flock

A macOS desktop application for managing contacts and sending personalized bulk SMS messages through the native Messages app.

## Features

- **Contact Management** — Add, edit, search, and filter contacts with phone number validation and active/inactive status tracking
- **Group Organization** — Create groups, manage memberships, and target messages to specific audiences
- **Templated Messaging** — Compose messages with `{{firstName}}`, `{{lastName}}`, and `{{fullName}}` placeholders that personalize per recipient
- **Batch Sending** — Configurable batch size and delay between batches to control send rate, with real-time progress tracking and cancellation
- **Draft System** — Save, edit, and duplicate message drafts
- **Message History** — Track delivery status per recipient with error reporting
- **CSV Import** — Bulk import contacts with duplicate detection, group auto-creation, and preview before executing
- **macOS Integration** — Send SMS via AppleScript through the Messages app and create contacts in the Contacts app
- **Dark Mode** — Toggle between light and dark themes

## Tech Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Frontend | React 19, TypeScript, React Router, TailwindCSS |
| Backend  | Express 5, TypeScript                           |
| Database | SQLite (better-sqlite3) with Drizzle ORM        |
| UI       | Radix UI, Lucide icons, Sonner toasts           |
| Tooling  | Vite 7, pnpm, ESLint, Prettier, Husky           |

## Prerequisites

- **macOS** (required for AppleScript SMS integration)
- **Node.js** v25+
- **pnpm** v10+

## Getting Started

```bash
# Install dependencies
pnpm install

# Push the database schema
pnpm db:migrate

# Start the dev server (frontend + backend)
pnpm dev
```

The app will be available at [http://localhost:5173](http://localhost:5173). The API server runs on port 5172 and Vite proxies `/api` requests to it automatically.

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Start frontend and backend concurrently      |
| `pnpm dev:client`  | Start Vite dev server only                   |
| `pnpm dev:server`  | Start Express backend only (with hot reload) |
| `pnpm build`       | TypeScript compile + Vite production build   |
| `pnpm lint`        | Run ESLint and TypeScript type checking      |
| `pnpm db:generate` | Generate Drizzle migration files             |
| `pnpm db:migrate`  | Push schema changes to the database          |
| `pnpm db:studio`   | Open Drizzle Studio for visual DB management |

### Raycast Integration

Scripts in `scripts/raycast/` provide quick start, stop, and toggle commands for use with [Raycast](https://www.raycast.com/). The main `scripts/central-flock.sh` script supports:

```bash
./scripts/central-flock.sh start   # Start the dev server and open in browser
./scripts/central-flock.sh stop    # Stop all related processes
./scripts/central-flock.sh status  # Check if running
./scripts/central-flock.sh toggle  # Toggle start/stop
```

## Project Structure

```
├── server/
│   ├── db/
│   │   ├── schema.ts          # Drizzle database schema
│   │   ├── index.ts           # Database connection
│   │   └── migrations/        # Generated migrations
│   ├── routes/                # Express route handlers
│   │   ├── people.ts
│   │   ├── groups.ts
│   │   ├── messages.ts
│   │   ├── drafts.ts
│   │   ├── import.ts
│   │   └── contacts.ts
│   ├── services/
│   │   ├── applescript.ts     # macOS Messages & Contacts integration
│   │   ├── csv-parser.ts      # CSV import parsing
│   │   └── message-queue.ts   # Async batch send job tracking
│   └── index.ts               # Express server entry point
├── src/
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── api.ts             # API client with TypeScript types
│   │   └── utils.ts           # Shared utilities
│   ├── pages/                 # Route page components
│   ├── App.tsx                # Root layout with routing
│   └── main.tsx               # React entry point
├── scripts/                   # Shell scripts for start/stop
├── drizzle.config.ts          # Drizzle ORM configuration
└── vite.config.ts             # Vite configuration with API proxy
```

## CSV Import Format

The import feature expects CSV files with the following columns:

| Column       | Required | Description                              |
| ------------ | -------- | ---------------------------------------- |
| Phone Number | Yes      | 10-digit US phone number                 |
| First Name   | No       | Contact's first name                     |
| Last Name    | No       | Contact's last name                      |
| Groups       | No       | Comma-separated group names              |
| Status       | No       | `active` or `inactive` (default: active) |
