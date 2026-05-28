# Mobile bottom-nav: fixed primary tabs plus a More sheet mirroring the desktop sidebar

## Context

The mobile navigation is a fixed bottom tab bar at `src/App.tsx:300-326`. It is **context-aware** by design: at the root it shows Home + one tab per nav group; once you're inside a group it swaps to Home + that group's children. Today's seven nav groups (People, Messaging, Devotionals, Schedules, Calendar, Sermon Prep, Music) push the root state to nine items including Home — which doesn't fit on any phone we target. The visible failure mode is labels wrapping ("Sermon Prep" → two lines) and items overflowing off the right edge.

A second failure mode is hidden inside Devotionals: it has six children (Dashboard, Devotions, Scriptures, Passages, Auditing, Gwendolyn's). Its in-group tab bar is therefore seven items — the same overflow problem as the root, just one drilldown away. Every other group is fine at ≤ 4 children.

Desktop has the opposite problem: it can comfortably show **every** group at once (the `CollapsibleNavGroup` sidebar at `src/App.tsx:115-126`), each expandable to its children. A future reader will reasonably expect mobile to be a compressed view of the same tree, not a different mental model.

Four structural shapes were considered:

- **Horizontal scroll.** Keep all 9 items visible-on-swipe. Cheapest. Rejected because off-screen items get used much less — the bar's whole job is to make destinations discoverable in one glance.
- **Icons-only at root.** Drop labels when showing top-level groups; restore them on drilldown. Fits 9 items but degrades the root state into a glyph quiz.
- **Hamburger / drawer.** Replace the root tab bar with a single menu button. Rejected because it deletes the bottom bar's primary value (one-tap access to common destinations) at the precise level where that value is highest.
- **"More" overflow sheet** (iOS-standard 5-tab pattern). Pick a small set of primary group tabs; an overflow tile opens a sheet for everything else. Scales as nav groups are added or removed.

Within the More-sheet approach there is a further question about what the sheet itself contains: just the non-primary groups, or the full nav tree. The full-tree variant doubles as a fix for a long-standing limitation — today you cannot jump from `/people` directly to `/devotions/passages` on mobile in fewer than two taps (tap Devotionals, wait for children to swap in, tap Passages).

## Decision

**Mobile bottom nav is Home + a primary group strip + More.**

- **Primary tab count: 4** (so the bar is `Home · 4 group tabs · More` — 6 items total). iPhone 16 Pro is the smallest device targeted; iPhone SE is explicitly out of scope.
- **Which 4 are primary: the first 4 from `navGroups` in `nav-config.ts` declaration order** — currently People, Messaging, Devotionals, Schedules. There is no separate "primary" config. Reordering `navGroups` reflows the mobile primary strip automatically.
- **In-group state follows the same rule.** When inside a group: `Home · first 4 children · More`. The only group affected today is Devotionals — its in-group bar is `Home · Dashboard · Devotions · Scriptures · Passages · More`, with Auditing and Gwendolyn's reachable via More.
- **More opens a bottom sheet rendering the full nav tree** — the same `CollapsibleNavGroup` component the desktop sidebar uses, with the same group ordering and child ordering. Every leaf is reachable in two taps from anywhere (More → leaf). Primary groups appear in the sheet too; the sheet is reliably "everything," not "the leftovers."

The context-aware swap is preserved (children replace primary tabs once you're inside a group). The "first N from declaration order" rule applies symmetrically at both levels.

## Why

- **Hard to reverse.** This is a mental-model change for the operator. Once muscle memory builds around "the primary 4 are always there + More is everything," reverting to a different shape (icons-only, horizontal scroll, drawer) means relearning. The decision specifically to bind "primary" to declaration order — rather than a hand-maintained list of pinned tabs — is the load-bearing irreversible choice; once code elsewhere assumes "the bar reflects `navGroups[0..4]`" we can't quietly switch to a separate config without rewriting that contract.

- **Surprising without context.** A future reader looking at the mobile nav code will see two questions answered without obvious justification: (a) why 4 primary tabs and not 3 or 5, (b) why does More contain primary groups too? The answer to (a) is the iPhone 16 Pro width budget and the user's explicit decision to not target smaller devices. The answer to (b) is "More is the desktop sidebar," not "More is the overflow bin." Both choices read as arbitrary without this ADR.

- **Real trade-off — three alternatives rejected.**
  - **Horizontal scroll.** Smallest code change. Rejected: items past the screen edge are invisible-by-default; the bar's discoverability value collapses to whatever fits the first screen anyway, with the added cost of users not knowing more exists.
  - **Icons-only at root.** Fits all 9. Rejected because the labels are the primary affordance — icons alone require memorizing the mapping, which is hostile to occasional-use sections like Sermon Prep.
  - **More-contains-only-non-primary-groups.** Less duplication; the sheet would only show Calendar, Sermon Prep, Music. Rejected because it forces the user to remember "is this section in the bar or in the sheet?" Putting everything in More — including the primary groups — eliminates that mental check and is the literal "matches desktop" answer.

- **Solves a latent UX gap.** Today, deep navigation across groups (e.g., `/people` → `/devotions/passages`) requires drilling through the destination group's intermediate state. The full-tree More sheet makes any leaf two taps away from anywhere, matching desktop.

## Consequences

- **`navGroups` declaration order is now load-bearing for mobile UX.** Reordering the array in `nav-config.ts` reflows both the desktop sidebar (visually) and the mobile primary tabs (semantically — which groups are always one tap away). The same applies to children within each group. No separate pinned-tabs config exists or should be added.

- **Adding a new nav group has predictable mobile behavior.** Appending a group to `navGroups` pushes that group into the More sheet; promoting it to "primary" means moving it to one of the first four slots. Removing a group automatically promotes whatever was 5th into the primary strip.

- **In-group More button is always rendered, regardless of child count.** Even Music (2 children) shows the More button. The rule is uniform: Home + first 4 children + More, where "first 4" may be fewer than 4 if the group has < 4 children. Always-present More avoids a conditional "sometimes there's a way to reach the rest of the app, sometimes there isn't" mental model.

- **The More sheet shares the desktop's `CollapsibleNavGroup` component.** Maintenance of group expansion, active-route highlighting, and child rendering happens in one place. Any future change to how groups render (e.g., badges, counts) ships to both desktop and mobile.

- **Devotionals' deep children move one tap away.** Auditing and Gwendolyn's are no longer reachable from the in-group bar without first opening More. Acceptable because these are lower-frequency than the four that stay (Dashboard, Devotions, Scriptures, Passages) — and Gwendolyn's is a separate-author surface anyway. If the access pattern flips later, reordering `devotions.children` to put them first is the lever.

- **No analytics-driven "promote most-used" mechanism.** The primary set is editorially controlled via declaration order, not derived from usage. If the operator finds Calendar more useful day-to-day than Schedules, the answer is to reorder `navGroups`, not to add a self-reorganizing layer.
