# Per-recorder tokens replace the shared attendance link

Attendance entry originally used a single shared, anonymous link gated by one static
`ATTENDANCE_PUBLIC_TOKEN` at cgen-api (see ADR-0014). To know _who_ entered each number, we replace
that with **per-recorder tokens**: a dedicated `Recorder` list (`name`, `token`, `active`), where
the recorder's token is itself the access gate — resolved in Central Flock's `/webhooks/attendance`
exactly like RSVP resolves its per-person tokens. The static shared secret is removed; cgen-api just
proxies the tokenized path.

Every save appends a `Record Edit` (full change log: recorder, snapshotted recorder name, values,
timestamp); the `Service Record` keeps the latest edit denormalized for display. Recorders
soft-retire via `active`; the name snapshot keeps history readable after a recorder is removed.

Considered and rejected: keeping the shared link and letting named tokens coexist (anonymous records
would leave attribution holes), and FK-only attribution without a name snapshot (deleting a recorder
would orphan their name in past history). Superseding the shared-link model is deliberate — the whole
point is that every recorded number is attributable.
