# Music Schedules paginate at service boundaries, amending ADR 0021's warn-and-clip rule

## Context

[ADR 0021](./0021-fixed-page-box-print.md) established the fixed 816 × 1056 page box and
deliberately rejected auto-continuation: _"Content that exceeds the box is never rescaled […]
Auto-shrink and auto-continuation onto a third page were both rejected for v1."_ That was right for
a **Workers' Notes Edition**, whose length varies by one or two lesson rows and where overflow is
an editorial problem with an editorial fix.

A **Music Schedule** is not bounded that way. A normal week is three service blocks on the Sunday
sheet and one on the Midweek sheet, comfortably inside a page. A revival week adds two or three
more services, a missions conference adds a Saturday meeting, and the content genuinely doubles.
Clipping a revival night off the bottom of the musicians' sheet is not an editorial problem the
author can fix by shortening a sentence.

## Decision

A **Music Sheet** flows onto as many pages as it needs, and **a break may only fall between
service blocks**. Content is measured, whole **Service Orders** are packed onto pages, and a block
that does not fit moves entire to the next page. The **Sound Booth Sheet** follows the same rule.

An explicit page-break **Order Line** lets the author force a split where they want one.

If a single service block is by itself taller than a page, it gets a page of its own and the
editor warns with the measured overflow — ADR 0021's behaviour, retained as the floor case.

The fixed page box itself is untouched. Every `pt` is still a literal point on paper, and every
other export in the app keeps warn-and-clip.

## Why

- **Hard to reverse.** Pagination is a measure-then-distribute pass sitting between the data and
  the page components. Removing it later means the pages must go back to rendering a known-length
  document, and any week that relied on flowing would silently start clipping.
- **Surprising without context.** ADR 0021 says in as many words that auto-continuation was
  rejected. A reader finding a paginator will reasonably think someone ignored the ADR. This file
  is the amendment: 0021's rule still governs every other fixed-page-box export, and the
  Workers' Notes in particular.
- **Real trade-off.** Breaking anywhere between lines uses paper more efficiently and never leaves
  a half-empty page. It also puts a page turn in the middle of a song set, in front of a musician
  who is playing at the time. Service-boundary breaking wastes some paper and never does that. For
  a document read _while it is being performed from_, the page turn is the more expensive failure.

## Consequences

- **Page count is not known until content is measured**, so the preview, the export loop, and the
  readiness warnings all read from one pagination result rather than each computing their own.
- **The Midweek footer** (the Ephesians 5:19 quote and the music-note graphic, configured in
  Schedule Settings) prints on the last Musicians page, wherever that lands.
- **The measure pass runs against the real page node**, the same one that prints — a second,
  differently-flowing layout would paginate a document nobody is looking at, for the same reason
  ADR 0021 requires the preview to be the real node scaled.
