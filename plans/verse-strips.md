# Bible Verse Memorization Strips PDF

## Context

The Sermon Prep section currently has Quotes, Research, Hymns. We're adding a new tool that takes a Bible verse as input and produces a printable PDF where each word is enlarged and boxed with enough spacing to cut between them with scissors. The cut-out word strips go on a board for memorization. The reference (e.g. "John 3:16") is printed at the top and bottom of every page so it too can be cut and pinned to the board.

User confirmed:

- US Letter (8.5×11), portrait, with normal printable margins
- Words flow across rows; cut vertically between words
- Reference appears at both the top AND bottom of every page
- One-off generator — no DB, no save list, no backend route

## Approach

A single client-side page that generates the PDF directly with `jspdf` (already a dependency). No html2canvas — we draw text + rectangles with jsPDF primitives so the PDF contains crisp, vector text rather than a rasterized image (better print quality at large sizes, smaller file).

## Files to create

1. **`src/pages/sermons/verse-strips-page.tsx`** — form page (reference, verse textarea, font-size selector, Generate button) plus a small live HTML preview underneath for sanity-checking before download.
2. **`src/lib/verse-strips-pdf.ts`** — pure function `generateVerseStripsPdf({reference, verseText, wordFontSize})` that builds the PDF and triggers download.

## Files to modify

1. **`src/lib/nav-config.ts`** (lines 81–92) — add a new child under the `sermons` group:
   `{to: '/sermons/verse-strips', label: 'Verse Strips', icon: Scissors}` (import `Scissors` from `lucide-react`).
2. **`src/App.tsx`** (around lines 402–409 where the other sermon routes live) — add
   `<Route path="/sermons/verse-strips" element={<VerseStripsPage />} />` and the import.

## PDF layout algorithm (`verse-strips-pdf.ts`)

Letter portrait at `unit: 'pt'` → 612 × 792 pt.

- **Margins:** 36 pt (0.5") on all sides.
- **Reference band:** 22 pt font, centered, drawn at top (y = margin + 22) and bottom (y = pageHeight − margin) of every page. Reserve ~50 pt top + 50 pt bottom for these bands.
- **Word boxes:** font size from selector (default 96 pt; options 72 / 96 / 120 / 144). For each word:
  - Measure width with `doc.getTextWidth(word)`; box width = textWidth + 2×16 pt padding.
  - Box height = fontSize × 1.2 + 2×12 pt padding.
  - Horizontal gap between boxes: 14 pt. Vertical gap between rows: 14 pt.
  - Wrap to next row when the next box would cross the right margin.
  - Page-break (jsPDF `addPage()`) when the next row would cross the bottom reference band; redraw top + bottom reference on each new page.
- **Cut guides:** draw each box with a thin (0.5 pt) dashed border via `setLineDashPattern([2, 2], 0)` — visible enough to see while cutting, faint enough not to dominate the printed word.
- **Edge case:** if a single word is wider than the printable width at the selected font size, shrink that word's font size to fit (better than failing).
- **Filename:** `verse-strips-{slug(reference) || 'verse'}.pdf` saved via `doc.save(...)`.

## Page UI (`verse-strips-page.tsx`)

Mirrors the form pattern from `src/pages/sermons/hymns-prep-page.tsx` (lines 49–120):

- `<h2>Verse Memorization Strips</h2>`
- `<Card>` "Verse Details" with:
  - Reference `<Input>` (e.g. "John 3:16")
  - Verse text `<Textarea rows={4}>`
  - Font-size button group (72 / 96 / 120 / 144 pt) — same visual pattern as the Hymnal filter buttons in `hymns-prep-page.tsx:107–125`
  - Generate PDF `<Button>` with `Download` icon (disabled when reference or verseText empty)
- A simple HTML preview block below the form: each word in a `border border-dashed rounded px-2 py-1 inline-block m-1` so the user sees the layout before clicking Generate.
- Use `usePersistedState` (from `@/hooks/use-persisted-state`) for reference / verseText / fontSize so refreshing doesn't lose work — same as `hymns-prep-page.tsx:23–27`.
- Toast success/error via `sonner`.

## Reuse / dependencies

- `jspdf` (already `^4.2.1` in package.json) — no new deps.
- shadcn `Button`, `Card`, `Input`, `Label`, `Textarea` from `@/components/ui/...`.
- `usePersistedState` from `@/hooks/use-persisted-state`.
- `toast` from `sonner`.
- Icons `Scissors`, `Download` from `lucide-react`.

## Verification

1. After implementation, run `pnpm eslint` and `pnpm prettier` (per `feedback_lint_format.md`).
2. Do **not** run `pnpm dev` manually — the launchd service is already serving (per `feedback_no_manual_dev.md`). Just open the running app in the browser.
3. Manual check:
   - Navigate Sermon Prep → Verse Strips.
   - Enter "John 3:16" and the full verse text.
   - Try font sizes 72 / 96 / 120; click Generate PDF for each.
   - Open the downloaded PDF and confirm:
     - Letter portrait, ½" margins.
     - "John 3:16" at top AND bottom of every page.
     - Each word in its own dashed box with clear gaps to cut between.
     - Multi-page handling for long verses (test with a long passage).
     - Words remain crisp text (zoom in the PDF — should be vector, not pixelated).
   - Try a verse short enough to fit one page, and a long passage that wraps to 2+ pages.
4. Confirm nav highlights "Verse Strips" when on the page and that Sermon Prep group stays expanded.

## Post-approval housekeeping

After ExitPlanMode, copy this plan to `central-flock/plans/verse-strips.md` so it lives with the project (per `feedback_plans_location.md`).
