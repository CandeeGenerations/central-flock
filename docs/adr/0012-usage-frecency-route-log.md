# Usage frecency via a server-side route-visit log resolved at read time

To prioritize the command palette by actual usage (reorder Navigation by
frecency; add a "Recent" group of entity deep links), we log navigation in an
**append-only `route_visits` table** (just `path` + `visited_at`) and derive
everything — section rollups and entity labels — at **read time** on the server.
Frecency (count + ~30-day recency decay) ranks both sections and recents.

We deliberately rejected the obvious alternatives. **Capture-at-visit** (each
page records its own label) was rejected because labels go stale on rename and a
per-page hook is exactly the kind of thing that gets forgotten on new pages.
**An aggregate/upsert table** was rejected because the log is meant to be reused
by future features, and granularity you discard can't be recovered. **localStorage**
was rejected because the data will be consumed elsewhere and should be shared.

Consequences: the client only logs a bare pathname (no per-page code); entity
labels are always current because they're resolved from each entity's table on
read; new entity routes are auto-detected generically (`/<section>/<id>`) and
degrade to a generic label if no pretty resolver exists yet. The one manual
maintenance point — a per-type label resolver — is centralized in one module and
guarded by a dev test that fails if an entity section lacks an entry, so it can't
silently rot.

The palette also becomes two-mode: the empty state stays curated (Navigation,
Create, Commands, Recent) while typing searches everything (all providers
restored) capped at 25 results. This reconciles the earlier "clean empty palette"
removal with the need to search all entities — the empty state was the real
problem, not entity search itself; the cap is the guardrail.
