# Double Booking is advisory and asymmetric

A **Double Booking** — a **Nursery Worker** in the nursery for a service she is also singing in —
is derived at read time and reported only. It never blocks a save, never blocks marking a schedule
final, never appears on an exported sheet, and the nursery generator does not avoid it. It is also
deliberately **not** a symmetric "this person is committed twice" check.

Both of those look like omissions and are not. Recording them here because both will be proposed
as improvements.

## Why the generator does not avoid it

`generateSchedule` in `server/services/nursery-scheduler.ts` is untouched. The active worker pools
are too thin for the conflict to be a hard constraint: Evening has exactly two eligible workers
(capped at 2/month each) against four or five Sundays, Sunday School has one, and Wednesday Evening
has one. A hard constraint is unsatisfiable by construction on Wednesdays, and on Evenings it would
trade a visible warning for a silently empty slot — strictly worse.

It would also go stale. Special music moves after a nursery schedule is finalised; a generate-time
constraint only sees the world as it was on generation day. The warning has to be live and derived
regardless, so building the constraint too would mean maintaining the same rule twice, with the
constraint being the half that quietly rots. The scheduler produces a draft; the human makes the
final adjustment.

## Why it is asymmetric

The check is "a **Nursery Assignment** exists where the same Person also has a **Special Music**
performance," not "the same Person appears twice at one Service Time." A Nursery Assignment is an
_exclusive_ commitment — it removes her from the auditorium for the whole service. Every other
commitment in this app is _present_: in the room. Present commitments stack freely and are normal:

| Same person, same service        | Double booked? |
| -------------------------------- | -------------- |
| Preaches and sings a solo        | No             |
| Sings a solo and sings in a trio | No             |
| Nursery and sings a solo         | **Yes**        |

A symmetric check over "everyone with a `person_id` at a `service_time_id`" would pull in `sermons`
and fire on the preacher who sings — a false alarm on entirely normal behaviour. A warning that
cries wolf gets ignored within a month, which would cost more than the feature is worth. Nursery is
the only exclusive source today; a future exclusive source (a sound booth roster, a bus route) joins
the check, while a future present source does not.

## Scope

Nursery and Special Music only. No general commitment-registry abstraction was built for a third
source that does not exist — Music Schedule references `people` nowhere, and Sermons is deliberately
excluded per the above.
