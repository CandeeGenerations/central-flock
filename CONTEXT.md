# Central Flock

Central Flock manages church contacts and bulk SMS. This glossary covers the domain language
used across its features. New feature areas add their terms here as they are designed.

## Language

### Devotions

**Devotion Slot**:
The durable position/identity of a **Devotion** — its `number` (unique, cited publicly and by
other devotions' chains) and its `date`. Stays fixed when content is swapped.
_Avoid_: Position, Episode.

**Devotion Content**:
Everything in a **Devotion** that isn't the slot — scripture, title, talking points, descriptions,
production/publish flags, notes, type, and chain lineage — plus its linked generated passages.
The part that moves in a **Swap**.

**Swap**:
Exchanging the **Devotion Content** of two devotions while each keeps its **Devotion Slot**
(number + date). Linked passages follow the content; other devotions' chain references (by number)
are left pointing at the number/box and are only warned about, not rewritten.
_Avoid_: Reorder, Reschedule (those move the slot, not the content).

### Fair Booth

**Slot**:
The fixed structural division of a fair day — Sat/Sun/Tue are two slots (2-6, 6-10), the other
six days are one slot (5-10). Data-shaped, not a day-of-week rule the volunteer thinks about.
_Avoid_: Shift, Period.

**Signup**:
One stored `fair_booth_signups` row — a person, a day, a start/end minute, and a shift role.
Created per **Slot** by the day editor, so a volunteer working 3-7 PM on a two-slot day has two
Signups. The unit the roster counts and `minSignupsForBold` measures.
_Avoid_: Shift, Assignment, Entry.

**Shift**:
The person-facing unit: one contiguous run of one person's **Signups** on one day at one shift
role. 3-6 plus 6-7 on the same day is one Shift; a genuine gap or a role change is not. One
Shift is one bullet on a **Shifts Card**. Derived at render time — never stored.
_Avoid_: Signup, Block.

**Grid Half**:
One of the two stacked bands of day-columns the schedule grid renders as — days 1-5 (Fri-Tue)
and days 6-9 (Wed-Sat) plus one filler column so both bands are the same width. A presentation
unit, not data: it's what the split PDF export puts on its own sheet.
_Avoid_: Row (rows are hours, days are columns), Page, Slot, Week.

**Shifts Card**:
A single 1080×1920 image of one person's **Shifts** for one fair — titled "Your Shifts", with the
person's name, an admin-configured intro line, and the bullets. Exported as JPG or texted to that
person via Messages.
_Avoid_: Schedule, Summary, Story.

**Reminder Run**:
One queued send covering one fair day — "text everyone working Sat Aug 1, the evening before."
Queued ahead of time as a standing instruction (schedule + target day + template), not as rendered
text: it resolves its recipients and their **Shifts** at the moment it fires, so a signup added
after it was queued is still included. A fair produces one Reminder Run per day.
_Avoid_: Blast, Campaign, Batch.

**Shift Reminder**:
The text one person receives from a **Reminder Run** — their **Shift** for the day the Run covers,
rendered through a template. One person with two **Signups** that merge into one **Shift** gets one
Shift Reminder, not two.
_Avoid_: Notification, Alert.

### Workers' Notes

**Workers' Notes Edition**:
One printed two-page "Four-Month Workers' Notes" document covering one four-month period —
page 1 the yearly theme, chorus, verse and the standing bullet paragraphs; page 2 the monthly
songs/mottos/verses and the Betty Lukens lesson table. Lives in the shared `schedules` envelope
as `schedule_type='workers_notes'` (see docs/adr/0006-multi-type-schedule-envelope.md), so it
inherits draft/final status, the logo, and the JPG/PDF export path.
_Avoid_: Sunday School Schedule (a future teacher roster would want that name), Notes, Handout.

**Yearly Theme**:
The church's theme for one calendar year — theme song title and writer credit, chorus lyrics,
tag lyrics, theme verse and reference, and the year's growth-plan sentence. Stored once per year
and shared by all three **Workers' Notes Editions** of that year, so the chorus is typed once and
an old edition re-exports with the theme it was printed with rather than the current one.
_Avoid_: Theme (the calendar-print page has its own per-month `theme` field), Motto (that is the
per-month line on page 2).

**Term**:
One of the three fixed four-month periods a **Workers' Notes Edition** covers — Jan-Apr, May-Aug,
Sep-Dec. Always inside a single calendar year, which is what lets the edition print one
**Yearly Theme** and derive every month label, box title, and the "Forms for <next Term>" sentence
without them being typed.
_Avoid_: Quarter (it is a third, not a quarter), Period, Trimester.

**Lesson Row**:
One line of the Betty Lukens table on page 2 of a **Workers' Notes Edition** — normally one Sunday
in the **Term**. Its kind decides whether it consumes a number from the running sequence:
`regular` consumes the next one, `special` (an out-of-sequence lesson or range like `151-153`)
consumes none, `combined` (no Sunday School that day) consumes none, and `note` is the italic
parenthetical line with no date or number. Regular numbers are derived from the edition's
starting number plus position, never stored per row.
_Avoid_: Lesson (that is the catalogued **Story**), Entry, Slot.

**Story**:
One entry in the Betty Lukens catalogue — a number (1-182), a title, and a page in the book.
The number is what a **Lesson Row** prints; the title never prints, it only labels the picker and
seeds the **Points to Emphasize**. About fifty are used a year, so the catalogue wraps roughly
every three and a half years.
_Avoid_: Lesson (means the row on the page).

**Points to Emphasize**:
The application sentence printed beside a lesson number — "We'll reap what we sow. (Galatians 6:7)"
— written by the Sunday School director, not taken from the **Story** title. Prefilled from the
last Points written for that Story in any prior edition, falling back to the Story's title, and
always editable.
_Avoid_: Application, Aim, Points (bare).

**Motto**:
The one-sentence line for a month on page 2 ("Rejoice that we're growing in grace!"), printed
verbatim on page 1 as that month's theme. One stored field feeding both pages — no capitalisation
transform; it prints as typed.
_Avoid_: Theme (that is the **Yearly Theme**), Slogan.

**Notes Block**:
One item in the ordered list that makes up the bullet section of page 1. Kind `note` is free text
(with `_underscore_` underlining) and copies forward verbatim into the next edition; kinds
`next_term_forms`, `growth_plan`, and `month_themes` are placeholders that render from the
edition's own **Term**, its **Yearly Theme**, and its **Mottos** respectively, so they can never
go stale when copied forward. `spacer` is a blank gap.
_Avoid_: Footer Block (that is the nursery/special-music footer), Bullet, Paragraph.

### Service Stats

**Service Time**:
An admin-managed, recurring worship-service slot identified by a name, a day-of-week, and a
time (e.g. "Sunday Evening" / Sunday / 18:30). The configurable list the admin maintains; the
public entry app groups these by day-of-week under a chosen week, and (week + day-of-week)
resolves to the concrete date stored on a **Service Record**.
_Avoid_: Service, Session, Event.

**Service Record**:
The attendance data captured for one **Service Time** on one specific date. Holds two fixed
numbers — **Attendance** and **Streaming**. Uniquely identified by (Service Time, date).
_Avoid_: Entry, Stat, Metric.

**Attendance**:
The count of people physically present at a service. In-person only.
_Avoid_: In-person count, Headcount.

**Streaming**:
The count of people/households watching the service online. Stored as "Attendance - Streaming"
in the legacy Church Metrics export.

**Total Attendance**:
A computed value, not stored: **Attendance** + **Streaming** for a **Service Record**.

**Recorder**:
A named person authorized to enter attendance from the public app. A lightweight identity
(`name`, `token`, `active`) independent of a contact/**Person**. Their token is their access gate
and the basis for attribution — the public link is per-**Recorder** so we know who entered a number.
_Avoid_: User, Counter, Usher, Contact.

**Record Edit**:
One entry of an **Attendance**/**Streaming** value against a **Service Record**, capturing which
**Recorder** entered it and when. Every save appends a **Record Edit** (full change log); the
**Service Record** keeps the latest edit's values and recorder for display.
_Avoid_: Revision, Log entry.

### Social Media

**Sermon**:
One preached message, recorded in the app by uploading its transcript. Identified by its
**Service Time** and date — the same key a **Service Record** uses, so AM and PM on one Sunday are
two Sermons. Owns the raw transcript and everything derived from it — **Social Quotes** and social
posts. Only sermons preached at a regular **Service Time** are recorded; funerals and outside
meetings are out of scope.
_Avoid_: Message (means an SMS in this app), Service, Recording.

**Speaker**:
The **Person** who preached a **Sermon**. Always a contact — guest evangelists and missionaries are
added to Contacts before their sermon is recorded, rather than stored as loose names. Only contacts
flagged `isPreacher` are offered as a Speaker, so the picker lists the handful of men who preach
rather than the whole church directory. The flag is person-level and stable, like `isHispanic` — a
guest evangelist keeps it between visits.
_Avoid_: Preacher (that is the flag, not the role on a given sermon), Author, Presenter.

**Social Quote**:
An excerpt of something the preacher said, lifted out of a **Sermon** transcript for use as a social
media story or post. Never paraphrased or rewritten — it carries the preacher's own words in three
forms (**Verbatim**, **Cleaned**, **Polished**) so the choice of how literal to be stays with him.
Distinct from a **Quote** (`quotes` table), which is a quote by _another author_ captured into the
sermon-prep research corpus.
_Avoid_: Quote (means the research corpus), Pull quote, Soundbite.

**Verbatim**:
The exact transcript span behind a **Social Quote**, character-for-character apart from sentence
spacing. The receipt — what was actually said, always viewable, never posted directly.

**Cleaned**:
The **Social Quote** with disfluencies removed — "uh", stutters, false starts, doubled words. No word
added, substituted, or reordered. The default form, and the one shown first.
_Avoid_: Edited, Corrected.

**Polished**:
An alternative form of the **Social Quote** offered alongside the **Cleaned** one, allowed to fix
grammar and supply elided words so the line stands alone out of context. Still the preacher's words
and meaning — it may repair a sentence, never write one. Offered, never chosen automatically.
_Avoid_: Rewritten, Paraphrased.

**Reflection**:
A short social post (~100-200 words) written from one portion of a **Sermon** — the second thing a
Sermon produces alongside its **Social Quotes**. Unlike a Social Quote it is not the preacher's exact
words: the AI may frame, connect, and write engagingly in order to give people something to sit with
during the week. What it may not do is add doctrine or **Scripture** the sermon did not preach.
A Sermon yields 3-5.
_Avoid_: Blog post (too long), Caption (too short), Devotional (means a Gwendolyn devotional here).

**Scripture Floor**:
The one hard limit on a **Reflection**'s liberty: it may reference only passages the preacher
actually cited in that sermon, and must render them in the **AKJV**. It may never introduce a
passage the sermon did not preach. Matches the existing rule in devotion generation.

**AKJV**:
The Authorized King James Version — the only Bible text this church uses, and the only wording any
generated **Reflection** may quote. Scripture references link to BibleGateway with `version=AKJV`.

**Rank**:
The ordering and `high`/`medium`/`low` tier the AI assigns each **Social Quote** and **Reflection**,
with a one-line reason, so the strongest results sort to the top. Advisory only — nothing is hidden
by a low rank, and the preacher is always the editor. Deliberately a tier and an order rather than a
number, because models rank within a batch far better than they self-score.
_Avoid_: Score, Confidence (imply a calibrated number).

**Favorite**:
A **Social Quote** or **Reflection** the preacher hearted. Outranks **Rank** entirely — a favorite
sorts to the top whatever tier the model gave it, because his judgement beats the model's. Ordering
is favorites, then unused before used, then Rank tier, then the model's within-batch order.

**Big Idea**:
The single statement the preacher wanted people to leave with, extracted as its own field on the
**Sermon** rather than as one more **Social Quote**. Usually said outright ("I want you to leave with
one statement…"). The anchor the week's **Reflections** are written around.
_Avoid_: Theme, Thesis, Takeaway.

**Cited Scripture**:
A passage the preacher actually referenced in a **Sermon**, recorded per sermon so the archive can
answer "have I preached this before, and when?" Also the whitelist the **Scripture Floor** enforces —
a **Reflection** may reference only these.
_Avoid_: Text, Reference (too generic), Passage (means a generated devotion passage here).

**Series**:
An optional name grouping **Sermons** preached as one arc — e.g. "Jesus is the Way, the Truth, and
the Life". Typed by the preacher, not inferred. A Sermon with no Series is normal, not incomplete.

**Quote Context**:
The few sentences on either side of a **Social Quote** in the transcript, shown so the preacher can
widen or narrow the cut to find the right line. Derived from the stored span offsets at render
time — never stored.

## Relationships

- A fair day has one or two **Slots**; a **Signup** is created against exactly one **Slot**
- A person's **Signups** on one day collapse into one or more **Shifts** (contiguous run, single role)
- A **Shifts Card** shows all **Shifts** for exactly one person on exactly one fair
- A fair has one **Reminder Run** per day; a Run covers exactly one day
- A **Reminder Run** produces one **Shift Reminder** per person with a **Signup** on the day it covers
- A **Shift Reminder** describes only the **Shifts** on the Run's day — never the person's whole fair
- A **Service Time** has many **Service Records** (one per date it is held)
- A **Service Record** belongs to exactly one **Service Time** and holds one **Attendance** and one **Streaming** value
- A **Service Record** has many **Record Edits**; its current value is the latest **Record Edit**
- A **Record Edit** is attributed to one **Recorder** (or to the admin, for in-app corrections)
- **Total Attendance** is derived, never entered directly
- A **Sermon** belongs to exactly one **Service Time** on exactly one date; that pair is unique
- A **Sermon** has exactly one **Speaker**, who is always a **Person**
- A **Sermon** and a **Service Record** for the same (**Service Time**, date) describe the same gathering
- A **Sermon** has many **Social Quotes**; each belongs to exactly one Sermon
- Every **Social Quote** has one **Verbatim** span, one **Cleaned** form, and one **Polished** form
- **Quote Context** is derived from a **Social Quote**'s span offsets, never stored
- A **Sermon** has 3-5 **Reflections**; each belongs to exactly one Sermon
- Every **Social Quote** and **Reflection** carries a **Rank**
- A **Reflection** is bound by the **Scripture Floor**; a **Social Quote** is bound by the transcript itself
- Re-uploading a transcript deletes that **Sermon**'s **Social Quotes** and **Reflections** and regenerates
- A **Sermon** has at most one **Big Idea**, many **Cited Scriptures**, and optionally one **Series**
- A **Reflection** may reference only the **Cited Scriptures** of its own **Sermon**
- A **Social Quote** may be promoted into the **Quote** corpus, citing its **Sermon** as the source

## Example dialogue

> **Dev:** "Becky worked 3-7 on Saturday. Her roster row says 2 signups but her card shows one bullet —
> which number is right?"
> **Domain expert:** "Both. The booth is split 2-6 and 6-10, so she signed up twice; she only showed up
> once. The card is what she experiences, the roster count is what I track."
> **Dev:** "So if she's Worker until 6 and Unit Leader after, is that still one **Shift**?"
> **Domain expert:** "No — she's in charge for the second half. That has to be its own line."

> **Dev:** "Someone signs up for Saturday on Saturday afternoon. Saturday's **Reminder Run** already
> went out Friday night — do they get a **Shift Reminder**?"
> **Domain expert:** "No, and that's fine — they signed up the day of, they know they're working.
> What can't happen is somebody signing up Thursday for Saturday and the Friday night text skipping
> them because I queued it on Wednesday."

## Flagged ambiguities

- "shifts" was used for both stored rows and the merged person-facing unit — resolved: rows are
  **Signups**, the merged unit is a **Shift**. The roster count and `minSignupsForBold` deliberately
  keep counting **Signups**; their labels say "signups" so the two numbers don't get conflated.
- "time slot" is overloaded and deliberately left alone. The printed grid footer tells volunteers to
  "put your initials in the time slot above" — that is a **Slot**. But template 28's `{{timeSlot}}`
  variable renders a **Shift**. The variable name is baked into the template and is not worth a
  migration; the resolver treats `{{timeSlot}}` as "this person's **Shifts** on the Run's day."
  A new variable should be named for what it holds, not copied from this one.
- "Category" (Church Metrics term for a configurable metric with Format/Kind/parent) was
  considered and rejected — for v1 the metrics are the two fixed fields Attendance and Streaming,
  and the configurable entity is the **Service Time** instead.
