import {type OAuthClientProvider, type OAuthDiscoveryState, auth} from '@modelcontextprotocol/sdk/client/auth.js'
import {OAuthError} from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import {randomBytes} from 'node:crypto'

import {assertOutboundAllowed} from '../sandbox.js'
import {type McpProvider, PROVIDERS, type ProviderId} from './providers.js'
import {loadSecrets, markConnection, saveSecrets} from './store.js'

// OAuth for MCP servers: the SDK's auth() does discovery, client registration, PKCE, code exchange
// and refresh; this file only supplies storage. Note auth() refreshes whenever a refresh token is
// stored, so it must only be called to sign in, to finish a sign-in, or when a refresh is due —
// and refreshes must hold the provider's lock (see client.ts).

const PENDING_TTL_MS = 10 * 60_000

export function publicBaseUrl(): string {
  return (process.env.FLOCK_PUBLIC_URL || 'https://flock.cgen.cc').replace(/\/$/, '')
}

const LOCAL_SERVER_BASE = 'http://127.0.0.1:5172'
const LOCAL_APP_BASE = 'http://127.0.0.1:5173'

export type RedirectTarget = 'public' | 'local'

export function callbackUrl(provider: ProviderId, target: RedirectTarget): string {
  const base = target === 'public' ? publicBaseUrl() : LOCAL_SERVER_BASE
  return `${base}/api/connections/${provider}/callback`
}

// Where the browser lands once the callback has stored the tokens.
export function appReturnUrl(provider: ProviderId, target: RedirectTarget, error?: string): string {
  const base = target === 'public' ? publicBaseUrl() : LOCAL_APP_BASE
  const params = new URLSearchParams({connection: provider})
  if (error) params.set('connectionError', error)
  return `${base}/settings?${params}`
}

// A sign-in that has been started but not yet finished, keyed by its single-use `state`.
interface PendingAuthorization {
  provider: ProviderId
  target: RedirectTarget
  codeVerifier: string
  createdAt: number
}

const pending = new Map<string, PendingAuthorization>()

function prunePending(now = Date.now()): void {
  for (const [state, p] of pending) if (now - p.createdAt > PENDING_TTL_MS) pending.delete(state)
}

export function takePending(state: string): PendingAuthorization | undefined {
  prunePending()
  const found = pending.get(state)
  pending.delete(state)
  return found
}

function expiresAtFrom(tokens: OAuthTokens): string | null {
  return tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null
}

class StoredOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | undefined
  stateValue: string | undefined
  private verifier: string | undefined

  constructor(
    private readonly provider: McpProvider,
    private readonly target: RedirectTarget,
    codeVerifier?: string,
  ) {
    this.verifier = codeVerifier
  }

  get redirectUrl(): string {
    return callbackUrl(this.provider.id, this.target)
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Central Flock',
      redirect_uris: [callbackUrl(this.provider.id, 'public'), callbackUrl(this.provider.id, 'local')],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.provider.preRegisteredClient ? 'client_secret_basic' : 'none',
    }
  }

  state(): string {
    this.stateValue = randomBytes(24).toString('base64url')
    return this.stateValue
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const stored = loadSecrets(this.provider.id).clientInformation
    const preRegistered = this.provider.preRegisteredClient?.()
    if (!preRegistered) return stored
    // Prefer the stored copy (it carries the SDK's issuer stamp) unless the env client changed.
    return stored?.client_id === preRegistered.client_id && stored.client_secret === preRegistered.client_secret
      ? stored
      : preRegistered
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    saveSecrets(this.provider.id, {...loadSecrets(this.provider.id), clientInformation})
  }

  tokens(): OAuthTokens | undefined {
    return loadSecrets(this.provider.id).tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    saveSecrets(
      this.provider.id,
      {...loadSecrets(this.provider.id), tokens},
      {expiresAt: expiresAtFrom(tokens), status: 'connected', lastError: null},
    )
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.verifier = codeVerifier
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error('No PKCE code verifier for this sign-in')
    return this.verifier
  }

  saveDiscoveryState(discoveryState: OAuthDiscoveryState): void {
    saveSecrets(this.provider.id, {...loadSecrets(this.provider.id), discoveryState})
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return loadSecrets(this.provider.id).discoveryState
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    const secrets = loadSecrets(this.provider.id)
    if (scope === 'all' || scope === 'tokens') delete secrets.tokens
    if (scope === 'all' || scope === 'client') delete secrets.clientInformation
    if (scope === 'all' || scope === 'discovery') delete secrets.discoveryState
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined
    saveSecrets(this.provider.id, secrets)
  }
}

// Begins a fresh sign-in and returns the URL to send the browser to. Existing tokens are dropped
// first — otherwise auth() would just refresh them instead of asking the user to sign in.
export async function startSignIn(providerId: ProviderId, target: RedirectTarget): Promise<string> {
  const provider = PROVIDERS[providerId]
  assertOutboundAllowed('mcp', `${provider.label} sign-in`)
  const oauth = new StoredOAuthProvider(provider, target)
  const secrets = loadSecrets(providerId)
  delete secrets.tokens
  saveSecrets(providerId, secrets, {status: 'needs_reconnect', expiresAt: null})

  const result = await auth(oauth, {serverUrl: provider.serverUrl})
  if (result !== 'REDIRECT' || !oauth.authorizationUrl || !oauth.stateValue) {
    throw new Error(`${provider.label} did not return a sign-in URL`)
  }
  prunePending()
  pending.set(oauth.stateValue, {
    provider: providerId,
    target,
    codeVerifier: oauth.codeVerifier(),
    createdAt: Date.now(),
  })
  return oauth.authorizationUrl.toString()
}

// Exchanges the authorization code from the callback for tokens.
export async function finishSignIn(p: PendingAuthorization, authorizationCode: string): Promise<void> {
  const provider = PROVIDERS[p.provider]
  assertOutboundAllowed('mcp', `${provider.label} sign-in`)
  const oauth = new StoredOAuthProvider(provider, p.target, p.codeVerifier)
  const result = await auth(oauth, {serverUrl: provider.serverUrl, authorizationCode})
  if (result !== 'AUTHORIZED') throw new Error(`${provider.label} sign-in was not completed`)
}

export class ConnectionError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly reason: 'not_connected' | 'needs_reconnect' | 'not_configured',
    message: string,
  ) {
    super(message)
  }
}

// Swaps the refresh token for new tokens. Caller must hold the provider's lock. A rejected refresh
// (expired/revoked/already-used token) marks the Connection as needing a fresh sign-in.
export async function refreshTokens(providerId: ProviderId): Promise<void> {
  const provider = PROVIDERS[providerId]
  assertOutboundAllowed('mcp', `${provider.label} token refresh`)
  if (!loadSecrets(providerId).tokens?.refresh_token) {
    markConnection(providerId, {status: 'needs_reconnect', lastError: 'No refresh token stored'})
    throw new ConnectionError(providerId, 'needs_reconnect', `${provider.label} needs to be reconnected`)
  }
  const oauth = new StoredOAuthProvider(provider, 'public')
  try {
    const result = await auth(oauth, {serverUrl: provider.serverUrl})
    if (result === 'AUTHORIZED') return
    // auth() swallows server-side (5xx/unknown) refresh failures and falls through to a new
    // sign-in. The refresh token was not consumed, so leave the status alone and let a retry try again.
    markConnection(providerId, {lastError: 'Refresh failed (server error); will retry'})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof OAuthError) markConnection(providerId, {status: 'needs_reconnect', lastError: message})
    throw new ConnectionError(providerId, 'needs_reconnect', `${provider.label} needs to be reconnected: ${message}`)
  }
  throw new ConnectionError(providerId, 'needs_reconnect', `${provider.label} needs to be reconnected`)
}
