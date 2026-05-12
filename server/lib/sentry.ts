import * as Sentry from '@sentry/node'

// Loaded via Node's --import preload flag (see package.json scripts and the
// launchd plist's ProgramArguments) so Sentry.init runs before http/express
// modules load. That's what enables the OpenTelemetry auto-instrumentation
// to wrap them and emit perf spans automatically.
const dsn = process.env.SENTRY_DSN_SERVER
const environment = process.env.SENTRY_ENVIRONMENT ?? 'development'
const release = process.env.SENTRY_RELEASE

// Strict PII scrubbing per docs/adr/0002-sentry-pii-policy.md.
// Drop request body, query string, cookies. Redact webhook tokens from URLs.
function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    delete event.request.data
    delete event.request.query_string
    delete event.request.cookies
    if (event.request.url) {
      event.request.url = event.request.url.replace(/\/webhooks\/rsvp\/[^/?#]+/, '/webhooks/rsvp/[REDACTED]')
    }
  }
  if (event.transaction) {
    event.transaction = event.transaction.replace(/\/webhooks\/rsvp\/[^/?#]+/, '/webhooks/rsvp/[token]')
  }
  return event
}

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (breadcrumb.data) {
    delete breadcrumb.data.input
    delete breadcrumb.data.response
  }
  return breadcrumb
}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export {Sentry}
