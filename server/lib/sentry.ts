import * as Sentry from '@sentry/node'

// Sentry initializes on module load. Imported early from server/index.ts.
//
// NOTE on ESM auto-instrumentation: in ESM, Sentry's automatic OpenTelemetry
// instrumentation for http/express requires Node's --import preload flag to
// wrap modules before they're loaded (see Sentry docs for ESM). Without it,
// manual error capture (captureException, setupExpressErrorHandler) and cron
// monitors work fine, but automatic perf spans for HTTP/Express are limited.
// To enable full auto-instrumentation later: run server via
//   tsx --import ./server/lib/sentry.ts server/index.ts
// (updates needed in dev script + the launchd plist).
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
