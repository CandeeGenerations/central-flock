import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
const environment = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE
const release = import.meta.env.VITE_SENTRY_RELEASE as string | undefined

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
    integrations: [Sentry.browserTracingIntegration()],
    // Aborted fetches and the existing 401 throw from src/lib/api.ts are not bugs.
    ignoreErrors: ['AbortError', 'Unauthorized'],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export {Sentry}
