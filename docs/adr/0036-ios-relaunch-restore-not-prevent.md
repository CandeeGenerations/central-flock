# iOS standalone relaunch: restore state, don't fight the reload

## Context

The app is added to the iOS home screen and runs standalone (ADR 0017). Switching to another app
and back re-executes the page from scratch. iOS kills backgrounded standalone web apps under
memory pressure and relaunches them cold; there is no API, meta tag, or manifest field that opts
out. The reload is not preventable.

What made it hurt more than it needed to: there is **no code splitting in the app at all** — no
`React.lazy`, no `Suspense` in `App.tsx`. The built bundle is a single 2.0 MB `index.js` plus
143 KB of CSS, fetched over the Cloudflare tunnel, containing every page, recharts, all of Radix
and react-query. (jsPDF and html2canvas are already split out, so the dynamic-import path works.)

## Decision

**Accept the reload and make it survivable, on two fronts.**

**State restoration.** The compose form is captured as an **Unsent Message** (ADR 0035) and
restored silently. This is the complete fix for the reported symptom, because an app-switch reload
re-executes the **current URL** — the user never leaves `/messages/compose`.

**Hybrid code splitting.** Heavy libraries (recharts, on five pages) and the burst-use sub-app
clusters — devotions, fair booth, music schedule, sunday school, fill-america — become lazy chunks.
The daily core — Home, Dashboard, Messages, People, Groups — stays in the main chunk.

**`start_url` stays `"/"`.** A cold icon launch therefore lands on Home rather than on the last
route. Instead of hijacking the launch, the Home **Needs Attention** strip gains a client-side
"Unsent message" segment; dismissing it hides the notice only and never destroys the buffer.

## Why

- **Surprising without context.** The glaring question a future reader asks about a PWA reloading
  on every app switch is *"why is there no service worker?"* Without this note, adding one looks
  like free money.

- **Real trade-off — alternatives rejected.**
  - **A service worker with a cache-first app shell.** The largest win: relaunch never touches the
    tunnel. Rejected because a stale cached shell served after a deploy is a genuinely nasty
    failure mode against a production-only database (RUNBOOK.md), and it would be debugged on a
    phone with no attachable console.
  - **Splitting every route.** Smallest cold start, but with no service worker each lazy chunk is a
    fresh tunnel round trip on first visit after a deploy — including Messages and People, which
    are opened constantly. Trades one slow cold start for a stutter on the common path.
  - **Splitting only the heavy libraries.** Safest, no navigation change, but leaves most of the
    2 MB in the initial payload, which is the number being optimised.
  - **Persisting the last route and redirecting on boot.** Truest to "resume where I was," but it
    hijacks the icon: every deliberate tap meant for Home lands somewhere else, and any freshness
    window chosen to soften that is wrong some of the time.
  - **Changing `start_url`.** Static, so it cannot point at wherever the user actually was, and
    ADR 0017 already makes the manifest's `display` field load-bearing for export behaviour —
    a file worth touching as little as possible.

## Consequences

- **The reload still happens.** Nothing here prevents it; the goal is only that nothing is lost and
  the gap is short. Judge changes here by whether state survives, not by whether the reload stops.
- **The app shell stays mounted across lazy chunk loads**, so bottom tabs, the FAB, and the command
  palette remain live while a page fills in — not the white screen a full reload produces today.
- **Every lazy chunk is a tunnel round trip on first visit after a deploy.** Moving a daily-use
  route (Messages, People, Groups) out of the main chunk regresses the common path and should not
  be done without re-reading this.
- **Reintroducing a service worker invalidates the reasoning above**, not just the file. The
  splitting boundary was chosen *because* there is no cache to fall back on.
- **The Home "Unsent message" segment is client-side**, unlike every other `NeedsAttention` segment,
  which comes from the server `HomeAttention` payload. It cannot be computed server-side — the
  buffer only exists on the device.
