# Conventions

One short file per area. Each says what to use, shows one example from the codebase, and lists
what not to do. Where a rule can be checked, a lint rule in `.oxlintrc.json` fails `pnpm lint` and
its message points back here. CLAUDE.md links each file under "Key Patterns".

| File                                             | Covers                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [outbound-calls.md](./outbound-calls.md)         | Anything that leaves the app, and the sandbox hard stop. Lint-enforced. |
| [seed-data.md](./seed-data.md)                   | Fake data for test copies: what a new table or feature adds.            |
| [schedulers.md](./schedulers.md)                 | Background jobs, boot-time recovery, and the one-replica rule.          |
| [deploy-and-staging.md](./deploy-and-staging.md) | How code reaches production, PR environments and the planned `staging`. |

More files land with the TanStack phases ([plans/tanstack-migration.md](../../plans/tanstack-migration.md),
decision 25): routes and search params, data loading and server functions with the Start rewrite,
then forms, tables, Pacer, Hotkeys and (if adopted) DB as each library phase finishes.

## Adding a convention

When a new library or pattern becomes the default, it gets three things in the same change:

1. a file here, in the same shape as the others;
2. a one-line pointer in CLAUDE.md → "Key Patterns";
3. a lint rule, where one can catch the drift.
