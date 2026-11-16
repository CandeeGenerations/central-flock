import * as Sentry from '@sentry/node'
import {Router} from 'express'

import {checkConnection} from '../lib/mcp-client/client.js'
import {hasConnectionsKey} from '../lib/mcp-client/crypto.js'
import {type RedirectTarget, appReturnUrl, finishSignIn, startSignIn, takePending} from '../lib/mcp-client/oauth.js'
import {PROVIDERS, type ProviderId, isProviderId, missingEnv} from '../lib/mcp-client/providers.js'
import {deleteConnection, getConnectionRow, loadSecrets} from '../lib/mcp-client/store.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const connectionsRouter = Router()

function providerParam(value: unknown): ProviderId | undefined {
  return typeof value === 'string' && isProviderId(value) ? value : undefined
}

function summary(id: ProviderId) {
  const provider = PROVIDERS[id]
  const missing = missingEnv(provider)
  const row = hasConnectionsKey() ? getConnectionRow(id) : undefined
  let hasTokens = false
  try {
    hasTokens = Boolean(row && loadSecrets(id).tokens?.access_token)
  } catch {
    // Undecryptable (CONNECTIONS_KEY changed) — treat as not connected; reconnecting overwrites it.
  }
  return {
    provider: id,
    label: provider.label,
    configured: missing.length === 0,
    missingEnv: missing,
    status: !hasTokens ? 'not_connected' : row!.status,
    expiresAt: row?.expiresAt ?? null,
    lastCheckedAt: row?.lastCheckedAt ?? null,
    lastError: row?.lastError ?? null,
  }
}

connectionsRouter.get('/', (_req, res) => {
  res.json((Object.keys(PROVIDERS) as ProviderId[]).map(summary))
})

// Returns the provider's sign-in URL; the browser navigates there. `target` picks which registered
// redirect URL to use: 'local' when the app is open at 127.0.0.1, otherwise the public tunnel.
connectionsRouter.post(
  '/:provider/start',
  asyncHandler(async (req, res) => {
    const id = providerParam(req.params.provider)
    if (!id) {
      res.status(404).json({error: 'Unknown connection'})
      return
    }
    const missing = missingEnv(PROVIDERS[id])
    if (missing.length > 0) {
      res.status(400).json({error: `Missing environment variables: ${missing.join(', ')}`})
      return
    }
    const target: RedirectTarget = req.body?.target === 'local' ? 'local' : 'public'
    res.json({url: await startSignIn(id, target)})
  }),
)

connectionsRouter.post(
  '/:provider/check',
  asyncHandler(async (req, res) => {
    const id = providerParam(req.params.provider)
    if (!id) {
      res.status(404).json({error: 'Unknown connection'})
      return
    }
    res.json({...(await checkConnection(id)), connection: summary(id)})
  }),
)

connectionsRouter.delete('/:provider', (req, res) => {
  const id = providerParam(req.params.provider)
  if (!id) {
    res.status(404).json({error: 'Unknown connection'})
    return
  }
  deleteConnection(id)
  res.json({ok: true})
})

// The OAuth redirect lands here. Mounted BEFORE requireAuth: the provider's redirect carries no
// app session guarantee, so it is authenticated by the single-use `state` minted in /start instead.
export const connectionsCallbackRouter = Router()

connectionsCallbackRouter.get(
  '/:provider/callback',
  asyncHandler(async (req, res) => {
    const id = providerParam(req.params.provider)
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const pending = state ? takePending(state) : undefined
    if (!id || !pending || pending.provider !== id) {
      res.status(400).send('This sign-in link is invalid or has expired. Start again from Settings → Connections.')
      return
    }
    const providerError = typeof req.query.error === 'string' ? req.query.error : undefined
    if (providerError || !code) {
      res.redirect(appReturnUrl(id, pending.target, providerError ?? 'missing_code'))
      return
    }
    try {
      await finishSignIn(pending, code)
      res.redirect(appReturnUrl(id, pending.target))
    } catch (error) {
      Sentry.captureException(error)
      console.error(`[connections] ${id} sign-in failed:`, error)
      res.redirect(appReturnUrl(id, pending.target, error instanceof Error ? error.message : 'sign_in_failed'))
    }
  }),
)
