# An Unsent Message is device-local and never a Draft

## Context

The compose page holds everything in React state. An iOS standalone relaunch — which happens on
any app switch, see ADR 0036 — wipes it, so a half-typed message is gone. The obvious fix is to
autosave into the `drafts` table: it already stores the entire compose form (content, recipient
mode, group ids via `draft_groups`, individual ids, excludes, batch settings, `scheduledAt`,
`templateState`, `rsvpListId`), and `createDraft`/`updateDraft` are already wired into the page.

The obvious fix is wrong. A **Draft** in this app is a deliberate artifact, minted only by pressing
*Save Draft*, and it is loud: it appears in the Drafts tab and its count badge, the dashboard
Drafts stat card, the Home **Needs Attention** strip once two days old, and the command palette.
Autosaving into that table means every abandoned half-sentence becomes a permanent row nagging you
from four places.

## Decision

**Autosave writes an `Unsent Message` — a separate concept — to `localStorage`, never to the
server.** It appears in none of the four Draft surfaces. It becomes a Draft only if the user
presses *Save Draft*. See `CONTEXT.md` for both terms.

**It is keyed per compose context** — `:new`, `:draft:<id>`, `:msg:<id>` — so it is only ever
restored where it was captured, and the restore notice can say "unsaved changes to this draft"
rather than guessing.

**It restores silently**, with a persistent inline notice at the top of the form carrying the
capture time and a **Discard**. Not a toast: a toast evaporates in seconds, leaving no way to clear
the buffer later.

**Discard blanks the form _and_ detaches from the draft**, returning the page to a clean
`/messages/compose`. The server copy is untouched.

**It is written from a ref via `setTimeout`, never React state**, plus a synchronous flush on
`pagehide` / `visibilitychange`. It is retired on send, on *Save Draft*, on *Discard*, or after
7 days.

## Why

- **Surprising without context.** A reader finds `localStorage` autosave in an app with a perfectly
  adequate `drafts` table and a working save path, and the natural instinct is to "simplify" it
  into a `updateDraft` call. That silently reintroduces the four-surface pollution and breaks
  autosave whenever the tunnel is slow or the phone is on bad signal.

- **Hard to reverse.** The Draft / Unsent Message split is now load-bearing vocabulary; unwinding
  it means revisiting every surface that assumes a Draft was deliberate.

- **Real trade-off — alternatives rejected.**
  - **A hidden row in `drafts` behind an `autosaved` flag.** Survives cleared storage and allows
    starting on the phone and finishing on the Mac. Rejected because the flag has to be threaded
    through five read paths to stay hidden, an autosave `PUT` at keystroke frequency races the
    explicit save against the same row, and it fails exactly when a phone most needs it — offline
    or on a weak signal. Cross-device handoff is served by pressing *Save Draft*, which is a
    deliberate act; recovery is not handoff.
  - **A single unkeyed buffer.** Simplest, but it cannot tell whether its contents belong to the
    compose page currently open, so it must either offer Draft #5's text inside a blank compose or
    silently drop it. Both are wrong.
  - **A restore prompt instead of silent restore.** Honest, but it announces the failure — a dialog
    every time iOS does something the user never asked for. The inline notice plus Discard gives
    the same escape hatch without the interruption.
  - **`useDebouncedValue` for the write trigger.** Already in this file, but it works by calling
    `setDebounced`, re-rendering a 1580-line page every 500ms while typing. Rejected on the
    explicit constraint that autosave must not slow typing.

## Consequences

- **`localStorage` is the only copy.** Clearing Safari data loses in-flight text. Accepted: the
  failure being fixed is a reload, not a wipe.
- **`pagehide` / `visibilitychange` are load-bearing, and `beforeunload` is not a substitute** —
  it does not fire reliably on iOS. Removing the flush reintroduces the bug precisely in the
  app-switch case that motivated the work.
- **Discard and Delete must stay visually and verbally distinct.** Discard walks away from a Draft;
  Delete destroys one. Discard deliberately does not sit in the bottom action bar next to Delete.
- **Discard must strip the query params, not just clear the fields.** A blank form still bound to
  `?draftId=5` overwrites Draft #5 with an empty message on the next *Save Draft*.
- **Orphaned keys accumulate** for drafts deleted elsewhere; the 7-day TTL is what bounds them.
- **Restore must sequence after the server draft loads.** `message-compose-page.tsx` populates the
  form from `draftData` at render time once the query resolves; a buffer applied on mount is
  silently overwritten a beat later.
- **No test coverage.** The repo has no test framework; the flush timing is verified by hand on a
  real device.
