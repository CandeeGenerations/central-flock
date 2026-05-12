# Sentry integration plan

End-to-end error tracking, performance tracing, and cron monitoring for Central Flock. Frontend (React) and backend (Express) both instrumented. Strict PII scrubbing per [ADR 0002](../docs/adr/0002-sentry-pii-policy.md).

## Scope summary

| Area          | Choice                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Products      | Errors + Performance traces. **No** session replay.                                      |
| SDKs          | `@sentry/node` (server) + `@sentry/react` (frontend).                                    |
| PII           | Strict — drop request bodies, query strings, cookies. See ADR 0002.                      |
| Schedulers    | All four wrapped with Sentry Cron Monitors.                                              |
| Releases      | Source maps uploaded; both SDKs tagged with git SHA.                                     |
| Error filter  | Capture unhandled exceptions + 5xx; skip 4xx; skip aborted fetches.                      |
| Send failures | Per-job aggregate Sentry event when >25% of recipients in a send job fail.               |
| UI errors     | Top-level `ErrorBoundary`, TanStack Query `onError`, unhandled promise rejection (auto). |

## Prerequisites

1. Create a Sentry org/project (free tier is sufficient). Two projects:
   - `central-flock-server` (platform: Node)
   - `central-flock-web` (platform: React)
2. Note the DSN from each project. Generate one **Sentry CLI auth token** with `project:releases` scope for source map upload.

## Step order

> Per project convention: do not skip prerequisites. Stop the launchd service **before** any DB migration step. There are no DB migrations in this plan, but the deploy at the end requires a service restart.

### 1. Install dependencies

```
pnpm add @sentry/node @sentry/react @sentry/vite-plugin
pnpm add -D @sentry/cli
```

### 2. Wire env vars in the launchd plist

Add to the operator's `cc.cgen.central-flock.plist`:

- `SENTRY_DSN_SERVER` — server project DSN
- `SENTRY_DSN_WEB` — web project DSN (also baked into the Vite build, see step 5)
- `SENTRY_ENVIRONMENT` — `production`
- `SENTRY_RELEASE` — set at build time from `git rev-parse --short HEAD` (not in plist; see step 5)

The build-time-only `SENTRY_AUTH_TOKEN` lives in the operator's shell profile, **not** in the plist (build runs interactively on the dev machine, not under launchd).

### 3. Server: initialize Sentry as the first import

Create `server/lib/sentry.ts`:

- `Sentry.init({ dsn: process.env.SENTRY_DSN_SERVER, environment, release, tracesSampleRate: 1.0, sendDefaultPii: false, integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()], beforeSend, beforeBreadcrumb })`
- `tracesSampleRate: 1.0` is safe — single-operator low-volume app.
- `beforeSend` drops `event.request.data`, `event.request.query_string`, `event.request.cookies`.
- `beforeBreadcrumb` drops `breadcrumb.data?.input` and `breadcrumb.data?.response` on fetch/http breadcrumbs.

Import `./lib/sentry.js` **at the very top** of `server/index.ts`, above every other import. The Sentry SDK patches `http`, `express`, etc., and must run before those modules are required.

### 4. Server: add a central Express error handler

Currently `server/index.ts` has no error-handler middleware — uncaught throws fall through to Express defaults and return HTML. As part of this install:

- Mount Sentry's request handler before route registration: `app.use(Sentry.Handlers.requestHandler())` (or the v8 equivalent — `Sentry.setupExpressErrorHandler(app)` runs at the end and registers both).
- After all route registrations and the static handler, call `Sentry.setupExpressErrorHandler(app)`.
- Add a final JSON error-responder middleware after Sentry's handler so the client gets `{ error: 'Internal server error' }` JSON instead of a stack trace HTML page.

Existing `res.status(4xx).json(...)` calls in routes are untouched — they never throw, so Sentry never sees them. That is the intended behavior.

### 5. Frontend: initialize Sentry in `src/main.tsx`

Create `src/lib/sentry.ts` and import it at the very top of `src/main.tsx`:

- `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment, release, tracesSampleRate: 1.0, sendDefaultPii: false, integrations: [Sentry.browserTracingIntegration()], beforeSend, beforeBreadcrumb })`
- Vite injects `VITE_SENTRY_DSN` and `VITE_SENTRY_RELEASE` at build time (see step 7).
- Same `beforeSend` / `beforeBreadcrumb` shape as server.
- Filter `ignoreErrors`: `['AbortError', 'Unauthorized']` so aborted fetches and the 401-from-`api.ts:11` don't fire events.

### 6. Frontend: wire the three UI error surfaces

This is the core "UI errors are caught as well" piece. Three independent surfaces, all required:

**a. Top-level React `ErrorBoundary`** — wraps the entire `<App />` in `src/main.tsx`. Use `Sentry.ErrorBoundary` with a `fallback` that shows a "Something went wrong — reload" panel. Without this, a render-time throw white-screens the app silently. There is currently no boundary anywhere in `src/App.tsx`.

**b. TanStack Query global error handler** — update the `QueryClient` constructor at `src/App.tsx:64`:

```ts
new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000}},
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error.message === 'Unauthorized') return // existing 401 handling
      Sentry.captureException(error, {tags: {queryKey: String(query.queryKey)}})
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error.message === 'Unauthorized') return
      Sentry.captureException(error)
    },
  }),
})
```

Without this, errors thrown by `src/lib/api.ts:15` (`Request failed: 500`) get rendered into per-component `isError` UI and never surface globally.

**c. Unhandled promise rejections** — `@sentry/react`'s browser SDK installs a `window.onunhandledrejection` listener automatically. No code needed, but verify in a smoke test by throwing from an un-`await`ed promise in dev.

### 7. Build: source maps + release tagging

Update `vite.config.ts` to add the Sentry Vite plugin:

```ts
sentryVitePlugin({
  org: '<org-slug>',
  project: 'central-flock-web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {name: process.env.SENTRY_RELEASE},
  sourcemaps: {assets: './dist/**'},
})
```

And `build.sourcemap: 'hidden'` so source maps are emitted, uploaded, then not referenced from the bundle (no public sourcemap URL).

Server side: TS compiles with `sourceMap: true` in `tsconfig.server.json` (verify) and uses `Sentry.init({ release })` — no upload step needed for Node, since `@sentry/node` reads source maps from disk.

Add a `prebuild` or wrap `pnpm build`:

```
SENTRY_RELEASE=$(git rev-parse --short HEAD) pnpm build
```

Document this in `README.md` so the operator doesn't run plain `pnpm build` and lose release tagging.

### 8. Cron Monitor instrumentation for all four schedulers

Files to touch:

- `server/services/scheduler.ts` (message-send queue)
- `server/services/birthday-scheduler.ts`
- `server/services/calendar-sync.ts`
- `server/services/specials-scheduler.ts`

For each scheduler's tick function:

```ts
const checkInId = Sentry.captureCheckIn(
  {monitorSlug: 'birthday-scheduler', status: 'in_progress'},
  {schedule: {type: 'crontab', value: '0 9 * * *'}, checkinMargin: 5, maxRuntime: 10, timezone: 'America/New_York'},
)
try {
  await tickBody()
  Sentry.captureCheckIn({checkInId, monitorSlug: 'birthday-scheduler', status: 'ok'})
} catch (err) {
  Sentry.captureCheckIn({checkInId, monitorSlug: 'birthday-scheduler', status: 'error'})
  throw err
}
```

Verify the actual schedule for each tick (look at the existing `setInterval` / cron strings in each scheduler file) and pass the correct `schedule.value`. Misstated schedules cause false "missed checkin" pages.

### 9. Webhooks

The `/webhooks/*` mount is its own auth domain (gated by `requireInternalSecret`, not session auth) and carries some PII-sensitive surface area that needs dedicated handling. Three concerns:

**a. URL-path token scrubbing.** `POST /webhooks/rsvp/:token` puts a per-person RSVP credential in the URL path. Strict `beforeSend` already drops the request body and query string, but **`event.request.url` is not scrubbed by default** — Sentry would capture `/webhooks/rsvp/abc123def...` verbatim, leaking the token. Add to `beforeSend`:

```ts
if (event.request?.url) {
  event.request.url = event.request.url.replace(/\/webhooks\/rsvp\/[^/?#]+/, '/webhooks/rsvp/[REDACTED]')
}
// Same for transaction names — perf traces also capture the URL:
if (event.transaction) {
  event.transaction = event.transaction.replace(/\/webhooks\/rsvp\/[^/?#]+/, '/webhooks/rsvp/[token]')
}
```

If future webhook routes use tokens in the path, extend the regex (or generalize to scrub any `/webhooks/.+/:token`-shaped segment).

**b. `asyncHandler` swallows errors before Sentry sees them.** `server/lib/route-helpers.ts:10-15` catches all route errors, `console.error`s them, and returns a 500 — it **never calls `next(error)`**, so the Sentry Express error handler installed in step 4 will never fire for any route using `asyncHandler` (both webhook routes plus many others). Fix in place:

```ts
// server/lib/route-helpers.ts
import * as Sentry from '@sentry/node'

export function asyncHandler(fn): ... {
  return (req, res) => {
    fn(req, res).catch((error) => {
      Sentry.captureException(error)
      const message = parseErrorMessage(error)
      res.status(500).json({error: message})
    })
  }
}
```

Drop the `console.error` line — Sentry replaces it. This is the chokepoint for the entire codebase, so this single change picks up every webhook route plus every `asyncHandler`-wrapped API route in one shot.

**c. Fire-and-forget `.catch(console.error)` patterns swallow background failures.** Five places do `something().catch((err) => console.error(...))` and never surface the failure anywhere external. Most are webhook-triggered or webhook-adjacent:

- `server/routes/rsvp-webhook.ts:245` — `sendNotifyMeText` (notify-me text on RSVP change)
- `server/routes/settings.ts:129` — `syncCalendarEvents` after settings update
- `server/routes/nursery.ts:304` — per-recipient send failure in nursery image-send

For each: replace `console.error(...)` with `Sentry.captureException(err, {tags: {source: '<feature>'}})`. The `tags.source` lets you slice these in Sentry by feature.

The remaining `console.error` lines in `routes/devotions.ts`, `routes/calendar.ts`, `routes/contacts.ts`, `routes/import.ts`, and `services/notify-me.ts` are inside try/catch blocks that also return a response — they will be picked up by the `asyncHandler` change in (b) if they re-throw, or can be left alone if the route intentionally swallows (e.g., contacts fetch that returns an empty list rather than 500). Decide per-site; default to letting the central handler take them.

**d. Confirm middleware ordering.** Verify `Sentry.setupExpressErrorHandler(app)` is called **after** `app.use('/webhooks', webhooksRouter)` and `app.use('/api', ...)` and the static handler. Step 4's ordering already handles this; just verify during step 4 that the webhooks line is above the Sentry handler line.

### 10. Send-failure aggregate event

In `server/routes/messages.ts` at the bottom of `processSendJob` (after the per-recipient loop completes, around line 654), add:

```ts
const total = job.recipientCount // or recompute from messageRecipients
const failed = job.failedCount // similarly
if (total > 0 && failed / total > 0.25) {
  Sentry.captureMessage('send job failure rate exceeded threshold', {
    level: 'error',
    tags: {messageId: String(job.messageId)},
    extra: {total, failed, rate: failed / total},
  })
}
```

Per ADR 0002, attach only `messageId`, counts, and rate — never recipient identities or message body.

### 11. Validation

Before declaring done:

1. `pnpm lint` and `pnpm prettier --write` — per project convention.
2. Trigger a deliberate server throw on a test route and confirm it lands in Sentry with **no request body** in the event payload (inspect via Sentry web UI).
3. Throw from a React component render and confirm the `ErrorBoundary` fallback renders and the event lands in Sentry.
4. Throw from inside a `useQuery` `queryFn` and confirm it lands via the `QueryCache.onError` path.
5. Manually run one scheduler tick and confirm a checkin appears in the Sentry Crons UI.
6. Inspect a real Sentry event's Request panel — confirm `body`, `query_string`, `cookies` are absent.
7. Hit `POST /webhooks/rsvp/<some-token>` with a deliberately bad payload and confirm the resulting Sentry event has `request.url` showing `/webhooks/rsvp/[REDACTED]` — not the real token.
8. Trigger a webhook route exception (e.g., temporarily throw inside an `asyncHandler`-wrapped handler) and confirm Sentry receives it — proves the `asyncHandler` Sentry-capture change in step 9b is wired correctly.

### 12. Deploy

Stop the launchd service, install the updated plist (new env vars), restart. Per project convention: do not run `pnpm dev` manually; rely on the launchd service after restart.

## Files touched

```
server/index.ts                         # import sentry first, mount handlers
server/lib/sentry.ts                    # new — server init + beforeSend
server/services/scheduler.ts            # cron monitor wrap
server/services/birthday-scheduler.ts   # cron monitor wrap
server/services/calendar-sync.ts        # cron monitor wrap
server/services/specials-scheduler.ts   # cron monitor wrap
server/routes/messages.ts               # aggregate send-failure event
server/lib/route-helpers.ts             # asyncHandler reports to Sentry instead of console.error
server/routes/rsvp-webhook.ts           # replace .catch(console.error) on sendNotifyMeText
server/routes/settings.ts               # replace .catch(console.error) on syncCalendarEvents
server/routes/nursery.ts                # replace .catch(console.error) on per-recipient send
src/main.tsx                            # import sentry first, ErrorBoundary
src/lib/sentry.ts                       # new — browser init + beforeSend
src/App.tsx                             # QueryClient onError handlers
vite.config.ts                          # sentryVitePlugin
tsconfig.server.json                    # verify sourceMap: true
README.md                               # document SENTRY_RELEASE build var
docs/adr/0002-sentry-pii-policy.md      # already added
```

## Out of scope

- Session replay (decided against).
- Page-view / feature analytics (wrong tool — would be PostHog or Plausible).
- Sentry alerts/notification rules — configure in Sentry UI, not in code.
