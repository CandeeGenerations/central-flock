# The Sound Booth Sheet is a projection of the Service Order, with hand-editable condensed lines

## Context

One week of services produces two printed documents that look nothing alike. The **Music Sheet**
the song leader and musicians read is the full run of service — every song and every prose line,
in order. The **Sound Booth Sheet** the sound team reads is a single condensed page: four
services, each showing a **Title**, a Text, and only a handful of the songs.

They overlap. `B #324` is the morning opener on both. So is `B #546`, the theme song. If the two
sheets were entered independently, the same hymn number would be typed twice every week and the
two sheets would eventually disagree — which is the exact failure the booth cannot absorb, because
they are putting the words of that hymn on the screen.

But the Sound Booth Sheet is not a mechanical subset either. Where the Music Sheet has three
labelled rows —

```
Motto:   Rejoice That God Allows... Soulwinners
Verse:   Proverbs 11:30
Theme:   B #546  Lead Me to Some Soul Today (x2 w/tag)
```

— the Sound Booth Sheet has one centred sentence. And the two paper originals condense it
_differently_: 23 August prints "Motto, Verse (Prov. 11:30), Theme Song (B #546, x2 & Tag)" while
16 August prints just "Motto, Verse, Theme Song". Same underlying content, different wording. That
is an editorial judgement, not a formatting rule.

## Decision

The **Service Order** is the single master. The Sound Booth Sheet is derived from it in two
different ways depending on the kind of row:

**Songs and Title/Text rows are linked.** The sheet prints the hymn reference and title through
the same `hymns` row the Music Sheet uses. A hymn number cannot differ between the two sheets
because there is only one of it.

**Condensed prose lines are drafted, then stored and hand-edited.** When the sheet needs a line
like "Motto, Verse, Theme Song" or "Prayer, Announcements, Pastor's Selection", it writes a first
draft from the **Line Roles** present in that service, then keeps that text in an editable field.
Your edits stand, and they copy forward to next week the way a **Notes Block** does.

Which lines reach the sheet at all is decided by **Line Role**, with an explicit per-line
include/exclude override. Roles also drive the _absence_ wording, which is the part that would
otherwise be retyped weekly:

| Situation                  | Sound Booth Sheet prints                      |
| -------------------------- | --------------------------------------------- |
| a `choir` line is present  | `Opening Song:` / _(Choir & Cong.)_           |
| no `choir` line            | `Cong. Opener:` / _(No Choir)_, highlighted   |
| a `pastor_selection` line  | `Prayer, Announcements, Pastor's Selection`   |
| no `pastor_selection` line | `…, NO Pastor's Selection TODAY`, highlighted |

## Why

- **Hard to reverse.** The link direction is the schema. Making the sheets independent later means
  a migration that invents booth-side song rows for every historical week; making the condensed
  lines purely derived later means discarding stored editorial text that has been copied forward
  for months.
- **Surprising without context.** A reader finds a text column holding a sentence the code can also
  generate, and the obvious cleanup is to delete the column and always generate it. The two paper
  originals are the argument against that, and they are not in the repo.
- **Real trade-off.** Strict generation is always consistent and needs no editing; stored text is
  always exactly what was wanted but can fall out of step with the master. We took stored text
  because the source documents demonstrably vary their wording week to week, and because the sound
  team's sheet is read under time pressure — wording that reads right matters more than wording
  that is provably derived.

## Consequences

- **A condensed line can go stale.** If the roles behind it change after it was drafted or edited —
  a choir line added, the pastor's selection removed — the stored sentence is now describing last
  week. The editor flags the line and offers a one-click rewrite from the master. It never rewrites
  silently, because silently rewriting is what would destroy the edit this ADR exists to preserve.
- **Copy-forward has to be selective.** Structure, prose, roles, booth toggles and condensed-line
  edits carry forward; songs, highlights, titles, texts and speaker notes clear. A highlight means
  "different this week", so carrying one forward would assert something false. See the plan.
- **Roles are load-bearing, not decorative.** Mis-tagging a line changes what the sound booth
  receives. The editor shows the booth consequence in the same table as the role, so the two are
  never looked at separately.
