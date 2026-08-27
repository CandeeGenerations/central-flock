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

### Nursery

**Nursery Worker**:
A **Person** who staffs the nursery, plus the nursery-specific rules that govern how often she can
be scheduled — her monthly cap, her per-service caps, and whether she may take more than one service
in a day. Always a contact: the link to a Person is required, which is what lets a nursery
assignment be compared against a **Special Music** performance for the same service. Carries an
optional name override for the roster to print (nursery worker "Yuny Mejia" is contact "Juni
Salgado"); with no override the contact's own name prints.
_Avoid_: Volunteer, Helper, Worker (bare — the fair booth has its own workers).

**Double Booking**:
A **Nursery Worker** assigned to the nursery for a service her **Person** is also expected in the
auditorium for — today, that means a **Special Music** performance on the same date and
**Service Time**. Asymmetric by design: a **Nursery Assignment** is _exclusive_ (it removes her
from the service), while singing, preaching, and playing are all _present_ commitments that stack
freely — a man who preaches and sings a solo in the same service is not double booked, and neither
is a woman who sings twice. Derived at read time, never stored, because either side can move at any
moment. Advisory only: it never blocks a save, never blocks marking a schedule final, and never
appears on a printed sheet — it is a tool for whoever is building the schedule, not a fact about
the service. Only Double Bookings dated today or later are surfaced — a past date has
nothing left to fix. A **Special Music** entry with no **Service Time** (a one-off) can never be double
booked, and neither can a **Guest Performer**, who is a loose name rather than a Person.
_Avoid_: Conflict (too generic), Overlap (means the nursery's cross-month carryover — see
docs/adr/0003-nursery-cross-month-overlap.md), Clash, Collision.

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
(with `*bold*`, `__italic__` and `_underline_` inline markup) and copies forward verbatim into the
next edition; kinds
`next_term_forms`, `growth_plan`, and `month_themes` are placeholders that render from the
edition's own **Term**, its **Yearly Theme**, and its **Mottos** respectively, so they can never
go stale when copied forward. `spacer` is a blank gap.
_Avoid_: Footer Block (that is the nursery/special-music footer), Bullet, Paragraph.

### Sunday School Roll

**Sunday School Roll**:
One quarter's blank attendance grids for the whole Sunday School — one **Roll Sheet** per
**Class**, all sharing one derived list of Sundays. A print-only artifact: it leaves the app as
paper, teachers mark it by hand, and nothing is ever captured back. Lives in the shared
`schedules` envelope as `schedule_type='sunday_school_roll'`
(see docs/adr/0006-multi-type-schedule-envelope.md).
_Avoid_: Attendance (that is the usher-entered in-person count — a number, captured digitally,
a different feature entirely), Attendance Sheet, Sunday School Schedule.

**Roll Sheet**:
One printed landscape page of a **Sunday School Roll** — one **Class**, its **Scholars** down the
left, the Roll's Sundays across the top, ruled to the bottom margin. Five of them per Roll,
exported as one PDF so the whole quarter is a single printing action.
_Avoid_: Roll (that is all five together), Page, Tab.

**Class**:
What one **Roll Sheet** is for — "3 yrs – Kindergarten", "1st-5th girls", "6th-12th boys". Not
purely an age band: four of the five split by grade _and_ gender. Deliberately **not** a
configured entity — it is a free-text label on the Roll Sheet, propagated to the next quarter by
copy-forward rather than by a settings list, so there is nothing to maintain between quarters.
_Avoid_: Age Group (two of the five are grade+gender), Department, Grade.

**Scholar**:
One name in the left column of a **Roll Sheet**. Free text, never a **Person** — Sunday School
children are minors and are deliberately kept out of Contacts. Not a row of its own: the whole
roster is one newline-separated field on the Roll Sheet, so line index _is_ row index and a blank
line prints as a deliberate blank row. Owned by the Roll Sheet, not by a **Class**, so the roster
is a snapshot of that quarter: a scholar who ages out simply is not copied forward, and last
quarter's Roll still prints them where they were.
_Avoid_: Student, Pupil, Child, Person (that is a contact), Member.

**Quarter**:
One of the four calendar quarters a **Sunday School Roll** covers — Jan–Mar, Apr–Jun, Jul–Sep,
Oct–Dec. A genuine quarter, unlike the Workers' Notes **Term**, which is a four-month third of the
year; the two sit side by side in the Sunday School area and must not be conflated. The Roll's
date columns are derived from (year, quarter) at render time and never stored — every Sunday in
the quarter gets a column, including one where Sunday School does not meet, which the teacher
strikes through on paper.
_Avoid_: Term (that is the Workers' Notes third), Period, Session.

### Music Schedule

**Music Schedule**:
One week's printed service planning, covering the Sunday (Sunday School, Morning, Evening) and the
Wednesday that follows it. Keyed by the week's Sunday date. Prints three pages from one body of
data: the **Music Sheet** for Sunday, the **Music Sheet** for Midweek, and the **Sound Booth Sheet**.
Lives in the shared `schedules` envelope as `schedule_type='music_schedule'`, so it inherits
draft/final status and the fixed-page-box PDF export.
_Avoid_: Special Music (that is the `special_music` feature — a soloist's number, not the run of a
service), Service Schedule (that is the printed title of one of its three pages), Order of Worship.

**Service Order**:
The ordered run of one service inside a **Music Schedule** — every song, every prose line, in the
order they happen. The master: the **Music Sheet** prints it whole, the **Sound Booth Sheet** prints
a selection of it. Seeded from the app's active **Service Times**, so a service carries its Service
Time, its date (derived from the week's Sunday plus day-of-week), and per-week overrides for time
and label. A service can be marked as not meeting that week, and one-off services (a revival night)
can be added without a Service Time.
_Avoid_: Service (means a **Service Time** or a meeting generally), Program, Lineup.

**Order Line**:
One row of a **Service Order**, printed as a row of a two-column table. A _split_ row fills both
cells — a song puts its `hymns` reference left and its title right; a labelled role puts "Choir:"
or "Motto:" left and the value right. A _merged_ row spans the full width, left-aligned on a
**Music Sheet** ("Prayer, Announcements") or centred on the **Sound Booth Sheet** ("Motto, Verse,
Theme Song"). Split-vs-merged and the left cell's text both default from the **Line Role** and are
both overridable, which is what makes a one-off row like "NO CHOIR | Cong. B #324 …" possible.
Carries a whole-line highlight toggle, `*bold*` / `__italic__` / `_underline_` inline markup (the
same markup as a **Notes Block**) — emphasis is per-word, never per-line — and an optional song
suffix — `(x2)`, `(Invitation)`, `(Optional)` —
kept as its own field so it prints unbolded beside a bold title. The unit that gets reordered, and
the unit the **Sound Booth Sheet** lifts.
_Avoid_: Item, Element, Row (bare).

**Line Role**:
What an **Order Line** is for — opening, choir, congregational, motto, verse, theme, pastor's
selection, invitation, special, message, plain. Drives three things: the label the **Sound Booth
Sheet** prints, whether that sheet includes the line by default, and the wording when a role is
_absent_ — no `choir` line prints "Cong. Opener (No Choir)", no `pastor_selection` line prints
"NO Pastor's Selection TODAY". Every line still has an explicit include/exclude override.
_Avoid_: Type (that is song vs prose), Category, Tag.

**Music Sheet**:
The musicians' and song leader's page — one service block after another, each showing its time,
every **Order Line** in order, with the hymn reference in the left column and the title in the
right. Two of them per **Music Schedule**: Sunday (Sunday School, Morning, Evening) and Midweek.
_Avoid_: Music Schedule (that is the whole week's edition).

**Sound Booth Sheet**:
The sound team's single page — all four services, each condensed to its **Title**, its Text, and
the handful of **Order Lines** their **Line Role** marks for the booth. Its label and value columns
share one width across all four service blocks and the whole grid is centred on the page. Its
condensed prose lines ("Motto, Verse, Theme Song"; "Prayer, Announcements, Pastor's Selection") are
drafted from the roles present and then freely editable, and those edits copy forward to the next
week.
_Avoid_: Service Schedule (its printed title, but too generic in code).

**Episode Number**:
The podcast number of a service's recorded message, printed on the **Sound Booth Sheet** as
`Title: (#100)`. Sequential in date order and **reset each calendar year** — the first uploaded
service of a year is #1 — scoped by the year of the service's own date, so a week straddling New
Year's numbers its Sunday from the old year and its Wednesday from the new. Assigned automatically
when a week is created and adjustable per service; Sunday School has none, because it is not
uploaded.
_Avoid_: Number (bare — a **Devotion** has one too), Sermon Number.

### Service Stats

**Service Time**:
An admin-managed, recurring worship-service slot identified by a name, a day-of-week, and a
time (e.g. "Sunday Evening" / Sunday / 18:30). The configurable list the admin maintains, and the
app's single vocabulary for "which service" — **Service Records**, **Sermons**, **Music Schedules**,
**Nursery Assignments**, and **Special Music** all key off it rather than off their own service
enums. Because it is a mutable row and not a frozen enum, a Service Time is _retired_
(`active = false`) rather than deleted once anything references it; retired Service Times still
render in past schedules and stop being offered on new ones.
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

**Tally**:
An _adjustment_ to a **Service Record**'s **Attendance** or **Streaming** — the ±1 an usher enters
by tapping a key in the entry app. Carries a change, never a total, which is what lets two devices
counting the same record both land: tallies from a phone that was offline and a laptop that was not
add together instead of one overwriting the other. A Tally may not take a count below zero, and it
carries the moment it was tapped (see docs/adr/0027-attendance-tally-adjustment-vs-correction.md).
_Avoid_: Tap (the gesture, not the entry), Count (that is the number itself), Increment, Delta.

**Correction**:
An absolute value written over a **Service Record**'s **Attendance** or **Streaming** — typed into
the entry app's Type box or edited on the admin dashboard. Unlike a **Tally** it _does_ override
whatever the number was, deliberately: typing 137 is a statement about the true count, not a
contribution to it. It settles the number as of the moment it was made: a **Tally** tapped earlier
but still queued on some device is discarded when it arrives, while one tapped afterwards applies.
_Avoid_: Edit (that is the log row), Set, Override, Adjustment (that is a **Tally**).

**Record Edit**:
One entry against a **Service Record** — either a **Tally** or a **Correction** — capturing which
**Recorder** made it and when. A Tally stores both its adjustment and the value that adjustment
produced, so the log reads as a ledger ("+1 → 42") and one device's contribution stays legible; a
Correction stores only the value. Every save appends a **Record Edit** (full change log); the
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
- A **Record Edit** is either a **Tally** (an adjustment) or a **Correction** (an absolute value)
- **Tallies** against one **Service Record** commute — order of arrival cannot change the total
- A **Correction** supersedes every **Tally** tapped before it, even one that arrives later;
  **Tallies** tapped after it apply on top — so a Tally carries the moment it was tapped
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
- A **Nursery Worker** is exactly one **Person**, plus nursery-specific caps and eligibility
- A **Nursery Assignment** places one **Nursery Worker** in one slot of one **Service Time** on one date
- A **Double Booking** is derived from one **Nursery Assignment** and one **Special Music** performance
  sharing a **Person**, a date, and a **Service Time** — never stored
- **Nursery Assignments**, **Special Music**, **Service Records**, **Sermons**, and **Music Schedules**
  all name their service by **Service Time**; none of them keeps its own service enum

## Example dialogue

> **Dev:** "Becky worked 3-7 on Saturday. Her roster row says 2 signups but her card shows one bullet —
> which number is right?"
> **Domain expert:** "Both. The booth is split 2-6 and 6-10, so she signed up twice; she only showed up
> once. The card is what she experiences, the roster count is what I track."
> **Dev:** "So if she's Worker until 6 and Unit Leader after, is that still one **Shift**?"
> **Domain expert:** "No — she's in charge for the second half. That has to be its own line."

> **Dev:** "You typed 137 on the laptop, but your phone still has three taps it never sent. When
> they finally go through, is it 137 or 140?"
> **Domain expert:** "137. When I type a number I've just counted the room — that's the number.
> Those three taps were part of getting to it."
> **Dev:** "And if you tap once more on the phone after typing 137?"
> **Domain expert:** "Then it's 138. That one's new."

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
- "real time" for attendance meant two different things — the count on a second screen being
  _current when you look at it_ (what was wanted) versus _pushed the instant it changes_ (what the
  phrase implies). Resolved as polling while a screen is visible plus a refetch on focus/wake, not
  streaming: docs/adr/0028-attendance-live-sync-by-polling.md.
- "Category" (Church Metrics term for a configurable metric with Format/Kind/parent) was
  considered and rejected — for v1 the metrics are the two fixed fields Attendance and Streaming,
  and the configurable entity is the **Service Time** instead.
- "service type" meant three different things — the nursery's `sunday_school|morning|evening|
wednesday_evening` enum, special music's `sunday_am|sunday_pm|wednesday_pm|other` enum, and the
  **Service Time** table that everything newer already used. Resolved: **Service Time** is the only
  vocabulary; both enums migrate to `service_time_id`. Special music's `other` becomes a null
  `service_time_id` with a free-text label, matching what **Music Schedule** already does for a
  one-off service.
- "Kim Stewart" existed twice with no link between them — as a `nursery_workers` row and as a
  `people` row — which is what made double booking undetectable. Resolved: a **Nursery Worker** is
  always a **Person**. Note the two names need not match: worker "Yuny Mejia" is contact "Juni
  Salgado", which is why the name override exists and why matching on name string was rejected
  (there are eight Kims in `people`).
