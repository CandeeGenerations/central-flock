# Bible Text

`akjv.json` is the app's **Bible Text** (see CONTEXT.md and docs/adr/0039): the King James Version,
standardized text of 1769, which is the text behind BibleGateway's AKJV. 66 books, 31,102 verses.

- **Source:** eBible.org, `eng-kjv_vpl.zip` (<https://ebible.org/Scriptures/eng-kjv_vpl.zip>),
  courtesy of the CrossWire Bible Society and eBible.org. Downloaded 2026-09-13.
- **Licence:** Public Domain outside the United Kingdom, where the Crown's letters patent restrict
  printing. See the source archive's `eng-kjv_about.htm`.
- **Changes from the source:** the Apocrypha dropped; italic supplied-word brackets removed and
  their words kept (`I [am] with thee` → `I am with thee`); pilcrows removed. Psalm superscriptions
  stay inside verse 1, as the source has them.
- **Shape:** `{books: [{name, chapters: [[verse1, verse2, …], …]}]}`, in canon order. `Psalms` is
  the book name; a reference to one psalm is written `Psalm`.

Rebuild with `npx tsx scripts/build-bible-text.ts path/to/eng-kjv_vpl.txt`. The build fails unless it
produces exactly 31,102 verses.
