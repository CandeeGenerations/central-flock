# Fair Booth Reminder Runs are queued as standing instructions, not as rendered text

Every other queued message in this app has its final text written _before_ it enters the queue:
`/api/messages/send` renders each recipient's copy at compose time into
`message_recipients.rendered_content`, and the scheduler only flips `status` and hands the frozen
strings to the send queue. A **Reminder Run** deliberately breaks that. A Run stores a
`schedule_id`, a `target_day`, a `template_id` and a `scheduled_at` — no recipients, no text. It
resolves who is working that day and what their **Shifts** are at the moment it fires.

The reason is that a fair booth schedule is a live document. ADR 0009 records that the printed
sheet "is reprinted weekly during the fair and circulated in churches to refill empty slots" — that
is the whole operating model, and it is why Fair Booth opted out of the draft/final lifecycle. Nine
reminders queued a week ahead with frozen recipient lists would contradict it: someone who signs up
on Thursday for Saturday would get no text on Friday night, and an edited shift would text the old
time. The failure is silent and lands on volunteers, not on the operator.

## Shape

`fair_booth_reminder_runs` is its own table (`schedule_id`, `target_day`, `template_id`,
`scheduled_at`, `status`, `message_id`), with its own resolver modeled on
`server/services/birthday-scheduler.ts`. When a Run fires it queries that day's `fair_booth_signups`,
groups them per person via `computePersonShifts`, renders template 28 with
`{{timeSlot}}` supplied through `renderTemplate`'s fourth `perRecipientVarValues` argument — the
same mechanism `{{rsvpLink}}` already uses — and only then creates an **ordinary, fully-rendered
`messages` row** which it sends through the normal queue. `messages` keeps its invariant that every
row's text is written before it sends; the standing instruction lives entirely in the new table.

Rejected: adding `fair_booth_schedule_id` + `target_day` columns to `messages` so pending Runs
appear in message history from day one. That was the more attractive UX — cancel, retime and
send-now all come free — but it grows a branch in the scheduler that every message in the app passes
through, and a pending Run would sit in history as a row with zero recipients and a preview
containing raw `{{timeSlot}}`. The blast radius was wrong for a feature shipped the day the fair
opened. The cost paid instead: pending Runs are visible on a Fair Booth card and only reach message
history once fired.

The shift-merging and formatting logic moves from `src/lib/fair-booth-render.ts` down into
`server/lib/fair-booth-shifts.ts` — a pure module with no db or express imports — and
`fair-booth-render.ts` re-exports it, leaving every client call site unchanged. Both the **Shifts
Card** and the **Shift Reminder** are then formatted by literally the same function, so the image a
volunteer was sent and the text they get the night before cannot describe their day differently.
Duplicating the ~60 lines into `server/` was the lower-risk option for shipping day and was rejected
for exactly that drift.

## Consequences

- **Preview and send share one resolver.** The preview endpoint calls exactly the code the send
  calls and renders every recipient's full message, not a sample. Any divergence between them would
  reintroduce the staleness this design exists to prevent, so they must never be two code paths.
- **The template is a live reference.** Editing template 28 mid-fair changes every pending Run.
  Queuing validates that the chosen template contains `{{timeSlot}}`; the resolver re-checks at fire
  time and, if the template is gone or no longer contains it, refuses to send and sends a notify-me
  text rather than delivering a message with a literal `{{timeSlot}}` in it.
- **Runs get a wider grace window than ordinary messages.** `doCheckScheduledMessages` marks
  anything more than 5 minutes overdue as `past_due` and never sends it — correct for a server that
  was down for a day, wrong for a reminder that is still useful an hour late. A Run sends late up to
  a cutoff, and past that goes `past_due` with a notify-me. This is a second, deliberate divergence
  from the main scheduler's semantics, and it is the reason the two schedulers stay separate.
- **`schedules.fairBooth.reminderSendTime` rewrites pending rows.** Changing the setting re-times
  every still-pending Run so the setting cannot silently disagree with the queue. A hand-edited
  single row therefore does not survive the next settings change — accepted, because a setting that
  displays one time while the queue holds another is the worse failure.
- **A Run covers one day, so a same-day signup is never reminded.** Deliberate: someone who signs up
  the morning of knows they are working. The case that must not happen is an _earlier_ signup being
  missed, and fire-time resolution is what guarantees that.
