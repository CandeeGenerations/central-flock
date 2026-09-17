# Messages are always sent from the default line; there is no sender selection

## Context

The Mac running Central Flock has two cellular lines on one iPhone (dual SIM), both registered to
one Apple ID. The natural feature request is to pick which line a send leaves from — bulk sends
through the second line, one-off personal texts through the primary — so that high-volume church
traffic does not clutter the operator's own text history.

The motivation was clutter on the _sender's_ side, not identity on the recipient's side. That
distinction is what decides the answer, so it is recorded here explicitly.

Three findings, gathered from `~/Library/Messages/chat.db`, close the question.

**The second line is a caller ID, not an account.** Grouping every thread by its owning account:

```
thread_account             service_name  threads
E:                         SMS           1471
E:<apple-id>               iMessage       711
P:+1XXXXXXXXXX (primary)   SMS            546
P:+1XXXXXXXXXX (primary)   RCS            109
...
```

Not one of 3,032 threads is keyed to the second line. The 99 iMessages already sent from it live in
threads owned by the Apple ID. Messages.app keeps a single unified conversation list, and the second
line does not get its own inbox — so routing sends through it would not remove a single thread from
the list. **The feature does not solve the problem that motivated it.**

**SMS and RCS are not controllable from the Mac at all.** Green-bubble traffic (11.9k SMS + 5k RCS
sent) relays through the iPhone via Text Message Forwarding, and the iPhone chooses the line. A
church list is mostly green bubbles, so even a working iMessage-only implementation would miss the
majority of any bulk send.

**There is no send-time hook for it anyway.** `sendMessageViaUI` (`server/services/applescript.ts`)
is UI automation — `open location "imessage://<phone>"`, then Cmd+A, delete, Cmd+V, Return. The
`imessage://` scheme takes no sender argument. The only API that could select an account,
`1st account whose service type = SMS`, was removed in `e3fce78` along with the `sendMethod`
setting, when scripted send was abandoned for UI automation.

The clutter itself is real but bounded: of 3,032 threads, 651 have never received a single inbound
reply, and 407 of those hold three messages or fewer.

## Decision

**Central Flock does not model a sending line, and every send goes out from whatever line Messages
is configured to use.** There is no per-message, per-group, or per-message-type sender selection,
and `sendMessageViaUI` / `sendImageViaUI` intentionally take no account parameter.

`CONTEXT.md` deliberately gains no **Sending Line** term. The app has no such concept, and adding
vocabulary for a capability that does not exist is worse than the gap.

## Why

- **Surprising without context.** The operator visibly owns two lines and has sent from both. Any
  reader — human or agent — will eventually ask why the compose page cannot choose between them,
  and the honest answer takes a Full Disk Access grant and four `chat.db` queries to reach. Without
  this note that investigation gets repeated.

- **Hard to reverse in the way that matters.** The code change is trivial; the _investigation_ is
  the expensive part, and its conclusion is not visible anywhere in the codebase.

- **A real trade-off.** Alternatives were considered and rejected:
  - **UI-script the caller-ID preference around each batch.** Messages → Settings → iMessage →
    "Start new conversations from" is a real, working control. Rejected because it is a _global_
    preference rather than a per-message parameter: a send that dies halfway leaves the Mac in the
    wrong state, hand-typed texts during a batch leave from the wrong line, it covers only iMessage
    recipients, it applies only to _new_ conversations so established threads are unaffected — and,
    decisively, it would not reduce thread clutter at all.
  - **Send bulk traffic through Twilio instead of Messages.** The only option that actually solves
    the stated problem: no threads are created, history stays in `messages` / `message_recipients`
    where it already lives, and it would retire the UI-automation fragility, focus stealing, and
    the ~1.5s-per-recipient floor. Rejected for now as disproportionate to 651 stale threads, and
    because it splits sending across two transports with two failure modes. **This is the option to
    revisit** — but only if the motivation changes from the operator's own clutter to a
    recipient-facing church identity, which Twilio serves and the second line does not.
  - **Sweep blast-created threads after sending.** Central Flock knows exactly whom it texted, so it
    could delete threads it created that never drew a reply. Rejected as not worth building: it can
    only ever touch the 651 one-way threads, since a bulk message to someone the operator actually
    converses with is interleaved into that person's real thread and cannot be separated from it.

## Consequences

- **Which line a message leaves from is a macOS setting, not an app concern.** Changing it is done
  in Messages → Settings → iMessage, affects everything the app sends, and needs no code change.
- **A future "send as the church" request is not this decision.** That is a recipient-facing
  identity requirement, and the answer to it is Twilio, not the second line — the second line cannot
  provide it either, since it shares one Apple ID and one inbox with the primary.
- **The clutter is unaddressed and will grow.** Accepted deliberately. If it becomes intolerable,
  the sweep is the cheap fix and Twilio is the real one.
