# Swappable lyric source for music search (web now, hymnal PDF later)

## Status

accepted

## Context

The quote search feature (`/sermons/research`) is being extended so a search can optionally also return **song lyrics** (verses/choruses) from the burgundy and silver hymnals, used as quotable material in messages. The `hymns` table stores only metadata + snippets (`title`, `first_line`, `refrain_line`, `author`, `tune`, `meter`, `topics`, `scripture_refs`) — it does **not** store full lyric text. So there is no lyric corpus to quote from today.

## Decision

The AI selects relevant hymns from the **stored hymn metadata** (grounding the *selection* in our real books), then sources the actual lyric text via **Claude's server-side web search tool**. This is the first tool-using AI call in the codebase — every other call today is a plain text/XML completion.

Lyric sourcing is hidden behind a single service function with a **source-agnostic result contract** so the source can be swapped without touching the API, stored JSON, or UI:

```
MusicResult {
  book, number, title, author,
  relevantLyrics,   // the verse(s)/chorus(es) that fit the theme
  note,             // why it fits
  relevance,        // high | medium | low
  source,           // 'web' | 'corpus'
  verified,         // did the fetched first line match our stored first_line?
  sourceUrl?        // web source (web path only)
}
```

**Web path (now):** select → web-search lyrics → verify the fetched first line against the stored `hymns.first_line`. Unverified results are **kept and flagged** ("unverified — double-check against the book"), not dropped, since the user reviews every result before pasting it into a message.

**Hymnal-PDF path (future):** when full hymnal PDFs are available, extract full lyrics into the `hymns` table (extending the existing `scripts/extract-hymns.ts` + `load-hymns.ts` pipeline). The music search then mirrors quote research exactly — send the lyric corpus, AI quotes relevant verses/choruses directly. No web search, no verification (`source: 'corpus'`, `verified: true`, no `sourceUrl`). **Only the internals of the lyric-source function change; the contract above, the stored `music_results` JSON, the API, and the tab UI stay identical.**

## Considered alternatives

- **AI recalls lyrics from training** — rejected: hymn lyrics get hallucinated/misquoted, unacceptable for content sent to people.
- **Return only stored `first_line` / `refrain_line` snippets** — rejected: too thin to pull a full verse or chorus into a message.
- **Extract full lyrics from PDFs now** — deferred (YAGNI): the PDFs aren't available yet. The swappable contract lets us adopt this later with no API/UI/storage changes.
- **Cache web-fetched lyrics back into the DB** — rejected for now: building a half-verified lyric library off web results muddies the future authoritative PDF corpus.

## Consequences

- Music results cannot use the quote rehydrate-by-id pattern (lyrics aren't in the DB), so they are stored **self-contained** as a JSON blob on the search row, mirroring `hymn_searches.sections`.
- Web search adds latency and per-search cost to the music half; the quote half is unaffected.
- The `verified` flag is meaningful only on the web path; the corpus path sets it `true` unconditionally.
