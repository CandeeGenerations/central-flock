---
status: accepted
---

# Central Flock moves fully to TanStack Start, in SPA mode, and Express goes away

After the Railway move (ADR 0043), the app is rewritten onto **TanStack Start**. Pages move from
React Router to Start's file-based TanStack Router routes. All 42 Express route files become Start
server routes or server functions, and Express is removed. Start runs in **SPA mode**: no server
rendering, and the browser renders every page as it does today.

Long-running work stays in the same Node process. The six schedulers, the message queue, SSE
progress and the boot-time recoveries start once from a single server start-up hook, guarded
against double-starting in dev hot reload and skipped entirely when `CENTRAL_FLOCK_SANDBOX=1`.
`/webhooks/*` keeps its exact paths, methods and `X-Internal-Secret` check, so cgen-api only ever
changes its base URL.

This was chosen over the recommendation to adopt TanStack Router alone and keep Express. The goal
is one framework end to end, with typed routes, typed URL query parameters, loaders that preload
Query data, and server functions called like ordinary functions. Future features, and the agents
that write them, then have one way to do each thing instead of two. Hosting no longer argued
against it: Start runs on Railway as an ordinary Node server.

## Considered options

- **TanStack Router only, keeping Express** (the recommendation). It brings most of the frontend
  gains for far less work, and Start stays possible later. Rejected so the stack wouldn't stay
  split between two server models for good.
- **Start and Express in one process**, with Express keeping `/api`, `/webhooks`, `/uploads` and the
  schedulers, and routes migrating one at a time. Rejected for the same reason. It may still be
  the shape the code passes through during the rewrite, but it isn't the end state.
- **Server rendering**, on all routes or selected ones. Rejected. It does nothing for a single-user
  app used mostly from a phone and iPad. It would need login handled inside server loaders, every
  browser-only module made server-safe (jsPDF, html2canvas, html-to-image, localStorage), and the
  iOS relaunch behaviour (ADR 0036) re-tested. Start also has an open issue where per-route
  `ssr: true` is ignored when `defaultSsr` is false.
- **A separate worker service for schedulers and the queue.** Rejected because a Railway volume
  mounts on one service only, so the worker couldn't open the SQLite file directly.

## Consequences

- **The rewrite happens on Railway, not the Mac.** It goes in pull requests with their own test
  environments, fake seed data and sandbox mode, so several agents can work on it at once.
- **Railway redeploys restart the server.** The Mac process ran for weeks at a time; this one
  won't. An in-progress send must finish, or be marked for retry, before shutdown. An open tab
  whose lazy chunk vanished in a deploy reloads once on `vite:preloadError`.
- **One replica**, as in ADR 0043. In-process schedulers make a second instance a double-send.
- **Shared conventions follow the stack:** `queryOptions` factories per domain (replacing
  `src/lib/query-keys.ts`), route loaders that call `ensureQueryData`, and validated search
  schemas instead of hand-read `useSearchParams`. They are written up as the project's conventions
  docs so new work uses them by default.
- **Lazy routes replace hand-written `manualChunks` grouping.** ADR 0036's split between a "daily
  core" and burst-use clusters still holds and has to be carried over deliberately.
- **Revisit when:** Start's SPA mode or server-route model changes in a way that breaks the
  in-process schedulers, or a feature truly needs server rendering (for example a public page
  served by Central Flock itself, which ADR 0014 currently rules out).
