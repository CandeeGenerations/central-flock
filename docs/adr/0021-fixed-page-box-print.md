# Workers' Notes prints from a fixed Letter-at-96-DPI page box, not fit-to-page scaling

## Context

Every existing export in the app captures a DOM node at a fixed pixel **width** with its height
determined by content, then scales the resulting image to fit a Letter sheet while preserving
aspect ratio. `useScheduleExport` does it at 800px for Nursery and Special Music;
`fair-booth-exports.ts` does it at `CAPTURE_WIDTH = 900`. The consequence is documented in a
comment in `fair-booth-exports.ts`:

> On-page font size scales as 1/CAPTURE*WIDTH — a narrower canvas maps each glyph to more mm on
> paper, enlarging the text. […] Narrowing the capture adds wrapped lines, tips the node into
> height-limited, and the type comes out \_smaller*.

That reasoning is correct for a schedule grid, where the node's height varies with how many
volunteers signed up and the document is a wall chart read at arm's length. It is wrong for the
Workers' Notes, which is a two-page handout read in the hand, where page 2's height varies
directly with how many Sundays fall in the **Term** (17 or 18) and how long each **Points to
Emphasize** line is. Under fit-to-page, adding three lesson rows shrinks every glyph on the sheet —
including the ones on page 1 that did not change. The requirement driving this feature was
explicitly "ensure the font size is readable and not shrink it."

## Decision

Each page of a **Workers' Notes Edition** renders into a box of exactly **816 × 1056 CSS pixels —
US Letter at 96 DPI** — captured at `pixelRatio: 3` (≈288 DPI) and placed on the PDF page edge to
edge.

Because the image ratio always equals the page ratio, the fit-to-page step is a no-op and
**every `pt` written in CSS is a literal point on paper**. `font-size: 11pt` prints as 11pt in
every edition regardless of content length.

The type scale is declared once, in points, read off the paper originals:

| Element                                  | Size      |
| ---------------------------------------- | --------- |
| "Central Baptist Church"                 | 20pt bold |
| "FOUR-MONTH WORKERS' NOTES"              | 18pt bold |
| Boxed months line                        | 14pt bold |
| Bullet paragraphs / chorus / lesson rows | 11pt      |
| Page-2 box headers                       | 13pt bold |

**Content that exceeds the box is never rescaled.** The editor warns with the measured overflow
("Page 2 overflows the printable area by 14mm") and the export clips visibly. Auto-shrink and
auto-continuation onto a third page were both rejected for v1.

The visible preview is the same node, scaled to the viewport with `transform: scale()` rather than
reflowed, so what is on screen is what prints and the ADR 0005 hit zones stay aligned at any zoom.

## Why

- **Hard to reverse.** The type scale is expressed in points against a page box; reverting to
  fit-to-page means re-tuning every size against a capture width, and the overflow warning — the
  only safeguard against an unreadable handout — becomes meaningless because overflow would
  silently resolve itself by shrinking.
- **Surprising without context.** The repo now contains three capture strategies, and one of them
  carries a long comment reasoning carefully in the opposite direction. A contributor unifying
  them would be doing an obviously good thing and would reintroduce content-dependent font sizing
  in the one document where it was specifically designed out. This file is the breadcrumb.
- **Real trade-off.** Fit-to-page maximises use of the sheet and never clips; a long edition still
  prints, just smaller. Fixed-box guarantees legibility and pushes the cost onto the author, who
  must shorten a line when the warning fires. For a wall chart the first is right; for a handout
  that a hundred workers read, an 8pt page discovered after the copier has run 80 sheets is the
  worse failure.

## Consequences

- **The preview must be the real node, scaled — never a fluid re-render.** A responsive preview
  would break line for line differently from the print node, making the overflow measurement
  describe a document nobody is looking at.
- **On a phone, fit-to-width renders 11pt body text at roughly 5pt.** This is accepted: a zoom
  stepper (Fit / 100% / 150%) covers reading, and each region's edit page carries its own
  region-sized mini-preview, which is where phone editing actually happens.
- **`skipFonts: true` is inherited from the existing capture helpers**, so any display face used
  in the page-1 header must be loaded by the app document itself; it is not inlined into the
  capture.
- **If the other exports are migrated to this method later**, the fair-booth comment quoted above
  must be updated or deleted with them — it will otherwise read as a live objection to the pattern
  the repo has adopted.
- **A third page is not generated automatically.** If a Term ever genuinely does not fit, the fix
  is editorial. Revisit only if it happens in practice.

## Amendment — the box has two sizes (Sunday School Roll)

The **Sunday School Roll** prints landscape, so `PrintPage`, `ScaledPage` and `exportFixedPagePdf`
take an `orientation` that defaults to `'portrait'` — Workers' Notes and Music Schedule are
unchanged. Landscape is the same box with the two dimensions swapped (1056×816, the same 58/48
padding) and the same 1:1 mapping to the sheet, so a `pt` in the CSS is still a real point on
paper in both. `pageWidthPx()` / `pageHeightPx()` / `contentWidthPx()` / `contentHeightPx()` are
the accessors; the bare `PAGE_WIDTH_PX` / `PAGE_HEIGHT_PX` constants stay, and stay portrait.

Two consequences of the pattern read differently landscape. A Roll's rows are a fixed count sized
to fill the box rather than content that might overflow it, so the overflow-warning machinery is
replaced by a page count: a roster longer than the grid spills onto a second sheet and the Roll
page says so before you print. And fit-to-width on a phone is kinder here than it is portrait —
the grid is rules and blank cells, so there is nothing small to read.

## Applied to — Nursery Schedule and Special Music Schedule

The **Nursery Schedule** and **Special Music Schedule** now print from this same fixed page box.
Three things about that extension are worth recording here rather than in a second ADR, because
they qualify what the Context section above argues.

**The wall-chart carve-out no longer holds.** The Context section reasons that fit-to-page "is
correct for a schedule grid, where the node's height varies with how many volunteers signed up and
the document is a wall chart read at arm's length" — which describes the Nursery Schedule exactly.
That reasoning assumed fit-to-page was buying those grids something. Measured, it was not: at an
800px capture width both sheets are _width_-limited in every realistic month, so the fit step
pinned them at ~9.7pt body type regardless of row count. Fit-to-page was not trading legibility
for flexibility on these two documents; it was giving up control of the type scale for nothing.
Under the fixed box they print at **12pt**, roughly 24% larger, with the worst case (a five-Sunday
nursery month, 21 rows) still clearing the page by ~30px.

**These two sheets set their own margins — 0.4in on all four sides**, not the 0.6in/0.5in the
Workers' Notes uses. That is not a preference; `useScheduleExport` already placed their images at
10mm margins, so adopting the default would have _narrowed_ the live area from 195.9mm to 185.4mm
and cost a full point of body type. Precedent is `BOOTH_PAGE_PADDING_X_PX` — a sheet sets its
margins from how it is read.

**Content still overflows into a warning, not a shrink and not a second page.** Row count cannot
realistically trip it; the type scale was sized against the hard ceiling. The unbounded input is
the **Footer Block** list, which is admin-typed free text stored per schedule type and takes about
a quarter of the page today, so the warning names it and links to the settings field that fixes it.
Page-boundary flow was rejected: a nursery wall chart that becomes two sheets defeats its purpose,
and the per-recipient pack would double in length.

**Fair booth is deliberately not migrated.** The `CAPTURE_WIDTH = 900` comment quoted in the
Context section above therefore stays live and correct _for fair booth_ — do not delete it on the
strength of this note. If fair booth is ever migrated, that is when it goes.
