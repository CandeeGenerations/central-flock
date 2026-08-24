# Attendance screens stay in sync by polling a week endpoint, not by streaming

A **Recorder** using a phone and a laptop expects a count entered on one to appear on the other
without a reload. We are doing that with a single `GET /webhooks/attendance/:token/week/:weekStart`
returning every **Service Record** for the week, polled roughly every three seconds while a screen
is visible and refetched on focus, wake, and reconnect — not with server-sent events, which would
be the obvious choice for "real time".

## Considered options

- **Server-sent events.** Sub-second, and rejected for now on operational grounds rather than
  technical ones. Central Flock runs for weeks at a time under launchd behind `cloudflared`, so
  every long-lived connection is state that must be released on both ends: a client set on the
  server, a heartbeat to detect dead peers, close-on-hide _and_ close-on-unmount in the client, and
  a Workbox exclusion — the entry app's service worker caches every `/attendance-public/` GET
  `NetworkFirst` and would try to cache a stream that never ends. Polling holds nothing open
  anywhere. Revisit if three seconds proves too slow with both screens side by side.
- **Polling the existing per-record endpoint.** Rejected: the pick screen issues one request per
  active **Service Time** (four today), so a three-second poll is 80 requests/minute per device
  against a 60/minute limit that `express-rate-limit` keys by IP — and both devices sit on the same
  church wifi.

## Consequences

- The batched endpoint collapses the pick screen from four requests to one, and both screens can
  read from a single query key, so the whole app polls on one timer.
- The GET rate limit must be re-keyed by token (or raised) as part of this change. Two devices at
  three seconds is ~40 requests/minute; a third usher's phone on the same wifi would start taking
  429s mid-service.
- A screen that is backgrounded or asleep stops polling entirely and re-syncs when it is looked at,
  so an idle laptop costs nothing across a morning.
- When a poll changes the number under an usher who is mid-count, the Entry Screen says so briefly
  ("updated elsewhere") rather than swapping digits silently — a digit moving on its own is how a
  count gets doubled.
