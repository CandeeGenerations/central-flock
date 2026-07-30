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
