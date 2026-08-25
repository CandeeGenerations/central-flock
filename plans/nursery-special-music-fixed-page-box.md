# Nursery & Special Music — fixed page box printing

Migrate the **Nursery Schedule** and **Special Music Schedule** off fit-to-page image scaling and
onto the fixed Letter-at-96-DPI page box already used by the Workers' Notes and the Music Schedule
(docs/adr/0021), so their type size is chosen rather than inherited from a capture width.

## Why

Both sheets render at a fixed 800px width with content-determined height, then get scaled to fit
Letter. Measured, they are _width_-limited in every realistic month — so the fit step pins the body
type at roughly **9.7pt** regardless of row count. Fit-to-page is not buying these two documents
flexibility; it is giving up control of the type scale for nothing. Under a fixed box they print at
**12pt** with the worst case still clearing the page.

Secondary: `SchedulePreviewFrame` sets `width: 800px, maxWidth: '100%'`, so the preview _reflows_ on
a narrow viewport — different line breaks than the print output. `ScaledPage` fixes that.

## Decisions

| #   | Decision               | Chosen                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------- |
| 1   | Which outputs move     | All four — PDF, JPG, texted image, on-screen preview                            |
| 2   | Overflow behaviour     | Warn and clip (ADR 0021 floor case). No auto-shrink, no page-2 flow             |
| 3   | Vertical fill          | Natural row height; white space trails at the bottom                            |
| 4   | Margins                | Own constants at 0.4in all round → 740×980 content box                          |
| 5   | Type scale             | One scale shared by both sheets (table below)                                   |
| 6   | Editing                | Nursery keeps inline `SearchableSelect`; add Fit/100%/150% zoom stepper to both |
| 7   | Components             | Rewrite `SchedulePreviewFrame` in place; new `print/schedule-scale.ts`          |
| 8   | Overflow warning       | Attributed, in mm, deep-linked to schedules settings. Advisory only             |
| 9   | Recipient subtitle     | Band reserved on every page, empty on Master Copies                             |
| 10  | Columns                | Fixed label columns, proportional value columns                                 |
| 13  | Warning measurement    | Hidden `exporting=true` mirror, not the live node                               |
| 14  | Nursery worker columns | Derived from `max(workerCount)`, not hardcoded `[1, 2]`                         |
| —   | Capture density        | `pixelRatio: 3` for PDF, `2` for JPG/text                                       |
| —   | ADR                    | No new ADR; amended 0021 with an "Applied to" section                           |

## Type scale

Points against the 740×980 content box, so each is a literal point on paper.

| Element                              | Today        | New                          |
| ------------------------------------ | ------------ | ---------------------------- |
| Logo height cap                      | 80px         | 72px (0.75in)                |
| Sheet title                          | ~13.9pt bold | 16pt bold                    |
| Recipient subtitle (DM Serif italic) | ~19.4pt      | 22pt                         |
| Table header row                     | ~9.7pt bold  | 11pt bold                    |
| Table body                           | ~9.7pt       | 12pt                         |
| Footer quote (DM Serif italic)       | ~11.1pt      | 12pt                         |
| Footer notes                         | ~9.7pt       | 10.5pt                       |
| Cell padding                         | 8px / 12px   | 4px vertical, 8px horizontal |

Footer notes are held down deliberately: at ~110 characters per authored line they take 3 wrapped
lines at 10.5pt and 5 at 12pt, and the extra 40px comes straight out of the table.

### Budget check

- **Nursery worst case** (5-Sunday month, 21 rows): header 130px + footer 219px leaves 631px;
  table needs 601px. ~30px spare.
- **Special music worst case** (14-Sunday quarter, 15 rows): the 5-line Psalm quote makes the
  footer 262px, leaving 588px; 14 one-line rows need 429px. ~159px slack absorbs ~8 wrapped lines.

## Work

1. **`src/components/print/schedule-scale.ts`** (new) — the table above plus
   `SCHEDULE_PAGE_PADDING_PX = 38`, column constants, `HIGHLIGHT = '#fde68a'`. Every tunable in one
   file; expect to iterate after the first proof.
2. **`SchedulePreviewFrame`** — rewrite in place as `ScaledPage` → `PrintPage` with the 0.4in
   padding override. Reserve the subtitle band unconditionally. Add `zoom`; expose the page node.
   Emit measured header/table/footer heights for the warning.
3. **Hidden measure mirror** — same children rendered with `exporting` forced true, offscreen at
   page width, with `data-` attributes on the three regions. Pattern follows `sheet.tsx`.
4. **`NurserySchedulePreview`** — derive worker column count from
   `Math.max(...serviceConfig.map(c => c.workerCount))`; generate headers; replace `[1, 2].map`.
   Fixed Date (90px) + Service (190px), workers split the remainder.
5. **`SpecialMusicSchedulePreview`** — drop the hardcoded `height: 52` row pin for natural height
   plus a min-height; fixed DATE (90px), service columns split the remainder.
6. **`fixed-page-pdf.ts`** — add a prepare-flush-capture variant for the Master Copy / Recipient
   Copy pack (one node rendered N times), placing each image edge to edge. Accept a `pixelRatio`.
7. **Overflow warning UI** on both view pages — mm, names the region, links to schedules settings.
8. **Cleanup** — delete `exportAs` / `exportMultiPagePdf` fit-to-page math; fold
   `inlineImagesAsDataUrls` into `fixed-page-pdf.ts`'s `inlineImages`; keep `describeExportError`.
   `pnpm lint` + `pnpm prettier`.

## Explicitly out of scope

- **Fair booth stays on fit-to-page.** Its `CAPTURE_WIDTH = 900` comment remains live and correct.
- **The Music Schedule's px-based overflow wording** is left alone.
- **A separate nursery mobile edit page** — the escape hatch if dropdowns over a scaled box prove
  bad on a phone, not part of this change.
