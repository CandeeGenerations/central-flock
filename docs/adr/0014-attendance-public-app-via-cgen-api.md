# Public attendance entry is a separate app proxied through cgen-api

Attendance counts are entered by ushers from a public, unauthenticated mobile page. Rather than
open a public hole in Central Flock's `requireAuth` boundary, we mirror the existing RSVP pattern:
a standalone Netlify SPA (`attendance-public`, `attendance.cgen.cc`) posts to `cgen-api`, which
holds the `X-Internal-Secret` and proxies to a new unauthenticated `/webhooks/attendance` endpoint
in Central Flock. The admin side (reports, service-time management) stays inside Central Flock
behind auth at `/attendance`.

Considered and rejected: serving a public `/attendance/entry` route directly from Central Flock.
Simpler infra, but it would require punching a public exception through the API auth middleware and
diverges from how RSVP already works. Consistency and a clean auth boundary won.
