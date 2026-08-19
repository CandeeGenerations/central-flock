# A Social Quote stores three forms of the same sentence

The transcript this feature consumes is raw ASR of a preached message, and it is not clean enough to
quote. The 2026-08-16 evening sermon contains `"the step of growing in ri- wisdom"`,
`"It's b- it's been written for a 4th grade level"`,
`"The commandments of the Lord are pure, con- uh, enlightening the eyes"` and
`"So we first of all see that God, the see that God is in the Word"` — and the file has no sentence
spacing at all (`"amen.And you may be seated."`). Character-exact verbatim is therefore not an
option that exists: even the strictest reading requires the machine to insert whitespace.

The stated requirement was "I don't want AI to add to the sermon, scripture, etc." The naive reading
of that is a single stored string, cleaned as little as possible. We rejected it in both directions:
clean too little and the quote ships with a stutter in it, clean too much and the preacher has no way
to know what was changed on his behalf. A **Social Quote** instead stores **three** forms of the same
sentence — **Verbatim** (the exact span, receipts), **Cleaned** (disfluencies deleted, no word added,
substituted or reordered), and **Polished** (grammar repaired and elided words supplied so the line
stands alone) — and the preacher picks per quote. The decision is not "how literal should this tool
be"; it is "the tool refuses to decide, and shows its work."

## Why this is hard to undo

The three forms are the table shape, not a rendering concern, and the span offsets that back
**Quote Context** tie a Social Quote to the exact transcript text it was cut from. Collapsing to one
column later loses the receipts for every quote already generated; adding the receipts later means
re-running generation against transcripts that may have been replaced. The fidelity model has to be
right at the first migration.

## The asymmetry with Reflections

A **Reflection** is governed by the opposite rule and this is deliberate. A ~150-word post is by
definition prose the model writes, so demanding groundedness there would have produced something
plainer than a church would ever post. Reflections get liberty of voice and framing; the one hard
limit is the **Scripture Floor** — a Reflection may reference only passages the sermon actually cited
(this one cites Psalm 19, Romans 1:20, John 1:1, Galatians 3:24, 1 Cor 2:14, John 16:13, Psalm 40:8,
Romans 7:18–8:2, Psalm 119:11, Romans 10:14) and must render them in the **AKJV**, matching the rule
already in `server/services/devotion-generation.ts`.

The line is drawn where the cost of being wrong is highest. A clumsy sentence in a Reflection is
embarrassing; a verse the preacher never preached, or the right verse in the wrong translation,
published under the church's name, is not recoverable by editing the post.

The corollary is that the model must never "correct" the preacher. This sermon renders Revelation
3:15–16 as `"God says, 'I would rather you be cold than lukewarm'"` — a paraphrase, and one that
inverts the verse's ordering. A Social Quote reproduces that as said. Silently substituting the AKJV
text would be the tool putting words in his mouth, which is the failure this whole design exists to
prevent.

## Flag, don't filter

Sermons at this church contain politically contested material — this one names transgenderism,
same-sex relationships and abortion, and argues against modern Bible translations. A ranker told to
favour engaging content will rate those spans **high**, because they are the punchiest lines in the
message. Suppressing or down-ranking them would be the tool quietly editing the pulpit, which is not
its job. Hiding them behind a toggle has the same defect.

So they are ranked normally and carry a `sensitive` flag with a reason, rendered as a badge. The
preacher chooses deliberately rather than at a glance. Flagged results are **additive**: the target
count (8–12 Social Quotes, 3–5 Reflections) counts unflagged results only, and anything flagged is
generated on top, so a sermon with contested material still yields a full usable set without the
badge deciding anything.

## Consequences

- **Editing a Social Quote never touches its Verbatim.** The preacher can rewrite the Cleaned or
  Polished text freely; the receipt underneath is immutable. A UI that let both drift would make the
  "show original" toggle a lie.
- **A garbled span is dropped, not repaired.** `"conuh, enlightening"` is a transcription error, not
  a disfluency, and Cleaned may not substitute words. Losing a quote is preferable to guessing what
  was said.
- **Selecting a span is itself editorial, and nothing in the model prevents that.** Cutting
  `"Get into the word until the word gets into us"` out of a longer sentence changes its emphasis with
  zero word changes. **Quote Context** — a few sentences either side, derived from the offsets at
  render time — exists precisely because the approval step is the only real guard.
- **Replacing a transcript invalidates offsets.** Re-upload is destructive by design: it deletes the
  sermon's Social Quotes and Reflections and regenerates. The alternative — re-locating stale quotes
  by string match against new text — was rejected as machinery serving a case that barely occurs.
- **Rank is a tier and an order, never a number.** Models rank within a batch far better than they
  self-score; a 1–100 confidence would return a pile of 82s that mean nothing. This matches the
  `relevance="high|medium|low"` plus `note` shape already used by `server/services/quote-research.ts`.
