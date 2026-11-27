# Deploy and staging

Production runs on Railway at `https://flock.cgen.cc` since 2026-11-25. Mac-only work goes through
cgen-api on the Mac mini. See [ADR 0043](../adr/0043-railway-hosting-with-mac-work-behind-cgen-api.md)
and [plans/railway-cutover.md](../../plans/railway-cutover.md).

## How code reaches production

- **A merge to `main` deploys.** Railway builds with `pnpm build`, then starts with `pnpm start`,
  which runs `db:migrate`, `db:seed` (a no-op in production) and the server. There is no
  pre-deploy command: Railway doesn't mount the volume for one.
- **Migrations run at every start**, so a merged migration runs on the next deploy. One that drops
  or rebuilds a table needs a manual backup first (`railway ssh -- pnpm snapshot:now`); see
  RUNBOOK.md.
- **Backups:** a nightly snapshot to `/data/backups` (7 nights) and a nightly pull to iCloud
  Drive on the Mac. Restoring: [railway-cutover.md](../../plans/railway-cutover.md) → "Restoring
  from a snapshot".
- **Rollback** of a bad deploy is reverting the commit on `main`. If the change touched the schema,
  restore a snapshot as well.

## Test copies

| Environment         | Data                                      | Status                                    |
| ------------------- | ----------------------------------------- | ----------------------------------------- |
| PR environment      | Fake seed data, under `/data/preview`     | On: one per PR, deleted on merge or close |
| `staging` (planned) | A nightly copy of production              | Not created yet (migration decision 22)   |
| Local               | Your own file via `CENTRAL_FLOCK_DB_PATH` | Any time, with `CENTRAL_FLOCK_SANDBOX=1`  |

Any Railway environment that isn't `production` is forced into sandbox mode at start-up
(`server/lib/preview-env.ts`), whatever its variables say. Secrets that reach outside
(`CGEN_API_KEY`, `ANTHROPIC_API_KEY`, `CENTRAL_FLOCK_INTERNAL_SECRET`, login) are **sealed** in
production, so Railway never copies them into another environment.

`staging` is meant to be login-protected, because it will hold real data, and to always run in
sandbox mode.

## Use

- Check a change on its PR environment before merging, where the feature shows there.
- Keep the production service at 1 replica ([schedulers.md](./schedulers.md)).
- Seal any new variable that grants access outside the app.

## Don't

- Deploy from the Mac. `scripts/deploy.sh` and the post-commit hook belong to the retired Mac
  service.
- Point a test copy at production data, cgen-api or a real webhook.
- Add a pre-deploy command that touches `/data`.
