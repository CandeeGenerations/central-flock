# Central Flock

Central Flock manages church contacts and bulk SMS. This glossary covers the domain language
used across its features. New feature areas add their terms here as they are designed.

## Language

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

- A **Service Time** has many **Service Records** (one per date it is held)
- A **Service Record** belongs to exactly one **Service Time** and holds one **Attendance** and one **Streaming** value
- A **Service Record** has many **Record Edits**; its current value is the latest **Record Edit**
- A **Record Edit** is attributed to one **Recorder** (or to the admin, for in-app corrections)
- **Total Attendance** is derived, never entered directly

## Flagged ambiguities

- "Category" (Church Metrics term for a configurable metric with Format/Kind/parent) was
  considered and rejected — for v1 the metrics are the two fixed fields Attendance and Streaming,
  and the configurable entity is the **Service Time** instead.
