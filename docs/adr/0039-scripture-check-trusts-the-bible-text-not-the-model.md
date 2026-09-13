# The Scripture Check trusts a local Bible Text, not the model

Gwendolyn Devotional #26 ("GOOD FEAR", 2026-09-13) went out with its first **Scripture Block**
cited as _Proverbs 25:29_. Her **Original**, recovered from the 2026-09-10 pre-migrate backup, shows
she sent it that way: the verse is Proverbs 29:25, transposed. Proverbs 25 has 28 verses, so the
reference pointed at nothing, and nothing in the app looked. The request was for AI to spot-check
her devotionals so that this stops happening.

We decided the checker is not the model. The app carries its own copy of the **AKJV**, the **Bible
Text**, and the **Scripture Check** is code that looks her **Fragments** up in it. The model is
consulted only when that lookup cannot place a Fragment (a paraphrase, a blend of two verses, a
modern translation). Anything it proposes is looked up in the Bible Text before it is shown. A
suggestion the Bible Text cannot confirm appears as a labelled guess with no one-click fix.

## Why not ask the model

The error we are guarding against is a wrong verse number, and that is exactly what a model gets
confidently wrong. Asked "is this Proverbs 25:29?", a model recalls the KJV wording well and
the address less well. A digit swap that lands on a real verse (29:25 → 25:29 happened to land on
nothing, but John 3:16 → John 6:13 would not) looks plausible to a model in a way it never does to a lookup.
A model's "looks right" also cannot be shown to the person reviewing. A lookup can put the real verse
beside hers.

A remote Bible API was the other alternative. We rejected it because the check needs a _reverse_
search ("where do these words appear?") across the whole Bible, which lookup APIs do not offer. It
would also make every keystroke of the live re-check a network call to a third party.

## Why this is hard to undo

- **Dismissals are keyed to the Bible Text.** A **Dismissal** of a wording **Finding** is bound to
  the quotation _and the verses it was checked against_. Swapping in a different edition or source
  would silently change what every stored Dismissal means.
- **The corpus is shared.** The Bible Text is deliberately not owned by devotions, so other
  features (Reflections' **Scripture Floor**, generated devotion passages) are expected to come to
  depend on it.

## Consequences

- **The edition is a fixed choice, and edition differences surface as Findings.** The Bible Text is
  the public-domain 1769 KJV text that underlies BibleGateway's AKJV. Where Gwendolyn copies from a
  source that differs in more than case, punctuation or British/American spelling (which matching
  ignores), the check reports _Wording Differs_. That is intended: the church's text is the AKJV.
- **Findings are derived, never stored.** The Bible Text never changes, so a stored verdict could
  only go stale. The only stored part of a Scripture Check is a person's Dismissal.
- **No automatic choice among ties.** When several locations contain every Fragment of a block, all
  are listed for a person to choose. An automatic pick in a tie is how a confident wrong verse would
  get back in.
- **The model can fail without consequence.** If `ANTHROPIC_API_KEY` is unset or the call fails, the
  check still runs in full. Only the _Not Found_ explanation is missing.
