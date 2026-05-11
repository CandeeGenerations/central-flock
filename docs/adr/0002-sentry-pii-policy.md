# Strict PII scrubbing for Sentry error reporting

## Context

Central Flock processes sensitive personal data: full names, phone numbers, SMS message bodies (often pastoral or church-administrative), Calendar.app data, and webhook payloads from the public RSVP system. We are adding Sentry for error tracking, performance tracing, and cron monitoring.

Sentry's default SDK behavior captures a substantial PII surface: HTTP request bodies, query strings, headers, breadcrumbs, exception messages, and (if enabled) local variables in stack frames. An uncaught exception inside `processSendJob` would, by default, ship the in-scope `recipients` array — phone numbers and message body — to Sentry's servers.

## Decision

Both the Node and browser SDKs are configured with **strict scrubbing**:

- `sendDefaultPii: false`
- `beforeSend` drops `event.request.data` (request body), `event.request.query_string`, and `event.request.cookies` before transmission.
- `beforeBreadcrumb` drops `data.input` and `data.response` on `fetch` / `xhr` breadcrumbs.
- No use of `Sentry.setUser` with a real identifier; if user context is set at all, it is a static `{id: 'operator'}` since the app is single-operator.
- The Express error-handler middleware passes the raw `Error` to Sentry — never the `req.body`, `req.query`, or `req.user` — and the strict scrub still applies as a second line of defense.

The result: when an error fires, Sentry sees the error type, stack trace, route path (no query string), git release SHA, and breadcrumb shape — nothing else.

## Why

- **Hard to reverse:** Data sent to a SaaS log sink is effectively unrecoverable. Loosening scrubbing later is a one-line config change; tightening retroactively requires us to trust deletion APIs and assumes nothing was already cached, indexed, or exported. The asymmetry favors strict-by-default.
- **Surprising without context:** A future reader will see a `beforeSend` hook that aggressively drops request data and wonder why we are hobbling Sentry's debuggability. This file is the breadcrumb: it is intentional, not an oversight.
- **Real trade-off:** Alternatives existed and were rejected:
  - _Sentry's server-side scrubbing rules_ — relies on data leaving the host before scrubbing, which is the exact thing we want to prevent.
  - _Field-name allowlist scrubbing_ — brittle. A new field name (`recipientPhone`, `smsBody`) leaks until a developer remembers to add it.
  - _Sentry defaults_ — easiest debugging, but the cost of accidentally leaking a member's phone number or a pastoral message to a third-party SaaS is asymmetric versus the convenience of pre-attached payloads. The operator can reproduce locally with full context when an error fires.

## Consequences

- Sentry errors will frequently be **less informative on their own** than the operator is used to from other apps. Diagnosis often requires reproducing locally from the route path + stack trace alone.
- Any future code that wants additional context attached to an error (e.g., a sanitized `messageId` for a send-job failure) must explicitly attach it via `Sentry.setContext` / `Sentry.setTag` and is responsible for confirming the value is non-PII.
- The Express error-handler middleware is the chokepoint for backend error capture; routes must not bypass it by `try/catch`-ing and silently returning 500 without rethrowing or manually calling `Sentry.captureException`.
- The per-job aggregate send-failure event (fired when >25% of a send job's recipients fail) attaches only `{messageId, totalRecipients, failedCount}` — never recipient identities or message body.
