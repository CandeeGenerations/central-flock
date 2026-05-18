# Calendar Print editor becomes preview-driven with a capture-target split

## Context

The Calendar Print Page (`src/pages/calendar-print-page.tsx`) historically edited month content through a left-column **Events** card — a per-date sorted list with add/edit/duplicate/delete affordances. The preview pane on the right was a passive render of the same `CalendarGrid` component used for the hidden PDF/JPG capture target.

The Inline Schedule Override feature ([CONTEXT.md → Inline schedule override](../../CONTEXT.md)) added a new per-cell concept (subset of Normal Schedule items rendered inline on a Sun/Wed/Sat cell). A second per-date list card alongside the existing Events card would have doubled the left-column density and made per-day editing happen in two visually separate places. Surfacing it from the preview itself (click a cell to manage it) was preferred for "click where you see it" ergonomics.

The change implicates the print-export path: the visible preview is also where edit affordances would live, but it must not contaminate the rendered PDF/JPG output.

## Decision

The Calendar Print editor is restructured so the **visible preview is the primary editing surface**. Every in-month cell is tappable; clicking opens a Day editor dialog that bundles event management and inline-schedule selection in one place.

To keep print output clean, the grid is split into two components:

- **`CalendarGrid`** (existing, in `src/components/calendar-print/calendar-grid.tsx`) — pure render. No event handlers, no hover state, no cursor styles. The off-screen capture target referenced by `captureRef` continues to mount this component directly and `html2canvas` reads from it.
- **`CalendarGridEditor`** (new wrapper) — renders the same `CalendarGrid` inside a positioned container with absolutely-positioned transparent hit zones over each in-month cell. The hit zones carry the `onClick` handlers, `:active` styling, and `cursor: pointer`. None of the hit-zone chrome reaches the export path because the export path doesn't mount `CalendarGridEditor` — only the hidden raw `CalendarGrid`.

The left column collapses to:

- **Page Details** (unchanged — theme, verse, color, schedule editor link).
- **Events this month** (new) — a read-only collapsible summary listing every event sorted by date, for at-a-glance verification. No edit affordances. Replaces the editable Events card.

The Day editor dialog has two sections: **Events** (list with add/edit/duplicate/delete — same form as today) and **Inline Schedule** (the picker; hidden on Mon/Tue/Thu/Fri). Title shows "Sun, May 17, 2026" style date.

iPad is a supported target:

- Affordances are touch-first. No hover-only reveals. Cells have no persistent edit chrome (the cell is the button). Tap feedback is a `:active` flash on the hit zone.
- The Schedule master editor reorders rows via up/down arrow buttons, not drag-and-drop — avoids adding a DnD dependency and dodges the desktop-vs-touch interaction-mode split.
- All tap targets are full-cell-sized.

## Why

- **Hard to reverse:** flipping the editor model is a structural change to how every edit flows. Rolling back means re-introducing the Events card, re-wiring all mutation entry points, and removing the Day editor dialog.
- **Surprising without context:** a future contributor sees two parallel grid components (`CalendarGrid` and `CalendarGridEditor`) rendering the same children with slightly different wrappers, and may consolidate them — losing the export-path isolation. This file is the breadcrumb saying "don't merge these."
- **Real trade-off:** keeping the editable Events card was simpler (no preview interactivity, no capture-isolation rule). The cost of staying there was making the new Inline Schedule Override a second list adjacent to Events, splitting per-day editing across two cards and forcing the user to context-switch by date even though a calendar grid was sitting right there. The preview-driven model unifies the per-day mental model. Accessibility is mildly weaker (no tab navigation across cells in v1); the read-only Events overview partially compensates.

## Consequences

- **Two grid components, one render contract.** Any visual change to the printed calendar happens in `CalendarGrid`. `CalendarGridEditor` only adds interaction chrome; it must not re-render content. PRs that touch `CalendarGridEditor` should not modify visible pixels in the off-screen capture path.
- **Export path is the source of truth for "what prints."** The visible preview being interactive means it's allowed to drift slightly in editor-mode (e.g. cursor pointer, faint tap flash). The hidden capture div is the canonical pixels. Manual print-comparison checks compare against the hidden capture, not the visible preview.
- **No DnD library is added.** Reorder is `↑`/`↓` arrow buttons on each row in the master Schedule editor. Schedule items are few (~10–15), so this is acceptable. Revisit if reorder ever feels painful.
- **Keyboard navigation is non-goal in v1.** The page is mouse/touch only. The read-only "Events this month" summary card partially mitigates by giving a tab-navigable read path. If accessibility complaints surface, add focusable cell affordances later — the hit-zone model accommodates `tabIndex` without touching the grid render.
- **Layout uses `lg:` and `2xl:` breakpoints same as today.** Two-column on iPad landscape; stacks on iPad portrait — the preview stays the dominant surface in both.
