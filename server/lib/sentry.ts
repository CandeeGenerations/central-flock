import * as Sentry from '@sentry/node'

// Loaded via Node's --import preload flag (see package.json scripts and the
// launchd plist's ProgramArguments) so Sentry.init runs before http/express
// modules load. That's what lets Sentry's instrumentation hook them and emit
// perf spans automatically.
const dsn = process.env.SENTRY_DSN_SERVER
const environment = process.env.SENTRY_ENVIRONMENT ?? 'development'
const release = process.env.SENTRY_RELEASE

const RSVP_TOKEN = /\/webhooks\/rsvp\/[^/?#]+/g

type StreamedSpan = Parameters<NonNullable<Sentry.NodeOptions['beforeSendSpan']>>[0]

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
      graphQL: {document: false, variables: false},
      genAI: {inputs: false, outputs: false},
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // v11 flipped this to true; keep v10's grouping for captureMessage events.
    attachStacktrace: false,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export {Sentry}
