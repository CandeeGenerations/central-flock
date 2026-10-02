import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
const environment = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE
const release = import.meta.env.VITE_SENTRY_RELEASE as string | undefined

const RSVP_TOKEN = /\/webhooks\/rsvp\/[^/?#]+/g

type StreamedSpan = Parameters<NonNullable<Parameters<typeof Sentry.init>[0]['beforeSendSpan']>>[0]

// Strict PII scrubbing per docs/adr/0002-sentry-pii-policy.md.
// Drop request body, query string, cookies. Redact webhook tokens from URLs.
function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    delete event.request.data
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.headers
    if (event.request.url) {
      event.request.url = stripQuery(event.request.url).replace(RSVP_TOKEN, '/webhooks/rsvp/[REDACTED]')
    }
  }
  if (event.transaction) {
    event.transaction = event.transaction.replace(RSVP_TOKEN, '/webhooks/rsvp/[token]')
  }
  return event
}

function stripQuery(value: string): string {
  return value.replace(/\?.*$/, '')
}

// Spans are streamed in v11, so beforeSendTransaction never runs. Scrub span names and URL-ish
// attributes here instead: no query strings, no RSVP tokens, no client address.
function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = span.name.replace(RSVP_TOKEN, '/webhooks/rsvp/[token]')
  for (const [key, raw] of Object.entries(span.attributes)) {
    if (/(^|\.)(query|client_ip|client\.address)$/.test(key)) {
      delete span.attributes[key]
      continue
    }
    if (typeof raw === 'string' && /^(url|http)(\.|$)/.test(key)) {
      span.attributes[key] = stripQuery(raw).replace(RSVP_TOKEN, '/webhooks/rsvp/[token]')
    }
  }
  return span
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
    // v11 replaced sendDefaultPii with dataCollection, which collects nearly everything when
    // unset. Turn every category off explicitly — see docs/adr/0002-sentry-pii-policy.md.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: {inputs: false, outputs: false},
      stackFrameVariables: false,
    },
    // v11 flipped this to true; keep v10's grouping for captureMessage events.
    attachStacktrace: false,
    integrations: [Sentry.browserTracingIntegration()],
    // Aborted fetches and the existing 401 throw from src/lib/api.ts are not bugs.
    ignoreErrors: ['AbortError', 'Unauthorized', 'Invalid password'],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export {Sentry}
