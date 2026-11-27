# Schedulers and the one-replica rule

Central Flock runs its background work inside the web server process: the scheduled-message
scheduler and send queue, birthday texts, fair booth reminders, calendar sync, specials, music scan
cleanup, the nightly snapshot, and boot-time recovery (Events Story runs, ungenerated sermons).

## Use

- **Start a new job from the one start-up block** in `server/index.ts` (`app.listen` callback),
  after the sandbox check. Nothing else starts timers. The Start rewrite moves this block into a
  single server start-up hook with a guard against double-starting in dev hot reload (ADR 0044);
  it stays one place.
- **Do the work through the approved clients** ([outbound-calls.md](./outbound-calls.md)), so a
  job that slips past the sandbox check still can't reach anything.
- **Make each job safe to restart.** Railway restarts the process on every deploy. A job must not
  double-send after a restart (record what it sent before or as it sends) and must pick up work it
  missed, or mark it failed so it can be retried, as `recoverInterruptedRuns()` does.
- **Times are local:** `TZ=America/New_York` is set on Railway.

Example:

```ts
// server/index.ts
app.listen(PORT, () => {
  if (isSandbox()) {
    console.log('Sandbox: background jobs disabled')
    return
  }
  startScheduler(processSendJob)
  startBirthdayScheduler()
  ...
})
```

## One replica only

Every replica would run every scheduler, so two replicas would send every scheduled text twice.
**Keep the Railway service at 1 replica**, in every environment. Scaling up means moving the jobs
out first, and a Railway volume mounts on one service only, so that is a design change, not a
setting.

## Don't

- Start a `setInterval`, `setTimeout` loop or cron from a route, a module's top level, or a request
  handler.
- Run a job in a sandbox. The early `return` covers everything started after it; keep new jobs
  below it.
- Raise the replica count, or add a second service that opens the same database.
