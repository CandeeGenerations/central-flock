import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport, StreamableHTTPError} from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import {withLock} from './mutex.js'
import {ConnectionError, refreshTokens} from './oauth.js'
import {PROVIDERS, type ProviderId, missingEnv} from './providers.js'
import {getConnectionRow, loadSecrets, markConnection} from './store.js'

// Reusable MCP client: hands a connected @modelcontextprotocol/sdk Client to a callback, with a
// fresh bearer token. The transport gets a static Authorization header (no authProvider) so that
// every refresh goes through refreshTokens() under the provider lock, never from inside the SDK.

const REFRESH_LEEWAY_MS = 2 * 60_000

function assertConfigured(providerId: ProviderId): void {
  const missing = missingEnv(PROVIDERS[providerId])
  if (missing.length > 0) {
    throw new ConnectionError(providerId, 'not_configured', `Missing environment variables: ${missing.join(', ')}`)
  }
}

function currentAccessToken(providerId: ProviderId): string {
  const tokens = loadSecrets(providerId).tokens
  const row = getConnectionRow(providerId)
  if (!tokens?.access_token || row?.status === 'needs_reconnect') {
    throw new ConnectionError(
      providerId,
      row ? 'needs_reconnect' : 'not_connected',
      `${PROVIDERS[providerId].label} is not connected`,
    )
  }
  return tokens.access_token
}

// Returns a usable access token, refreshing first if it is about to expire.
export function getAccessToken(providerId: ProviderId): Promise<string> {
  assertConfigured(providerId)
  return withLock(providerId, async () => {
    const token = currentAccessToken(providerId)
    const expiresAt = getConnectionRow(providerId)?.expiresAt
    if (expiresAt && Date.parse(expiresAt) - Date.now() < REFRESH_LEEWAY_MS) {
      await refreshTokens(providerId)
      return currentAccessToken(providerId)
    }
    return token
  })
}

// Refreshes after the server rejected `staleToken` — unless another caller already replaced it.
function refreshAfterRejection(providerId: ProviderId, staleToken: string): Promise<string> {
  return withLock(providerId, async () => {
    if (loadSecrets(providerId).tokens?.access_token === staleToken) await refreshTokens(providerId)
    return currentAccessToken(providerId)
  })
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof StreamableHTTPError && error.code === 401
}

async function connect(providerId: ProviderId, accessToken: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(PROVIDERS[providerId].serverUrl), {
    requestInit: {headers: {Authorization: `Bearer ${accessToken}`}},
  })
  const client = new Client({name: 'central-flock', version: '1.0.0'})
  await client.connect(transport)
  return client
}

export async function withMcpClient<T>(providerId: ProviderId, fn: (client: Client) => Promise<T>): Promise<T> {
  let token = await getAccessToken(providerId)
  for (let attempt = 0; ; attempt++) {
    let client: Client | undefined
    try {
      client = await connect(providerId, token)
      return await fn(client)
    } catch (error) {
      if (attempt > 0 || !isUnauthorized(error)) throw error
      token = await refreshAfterRejection(providerId, token)
    } finally {
      await client?.close().catch(() => undefined)
    }
  }
}

export interface ConnectionCheck {
  ok: boolean
  reason?: ConnectionError['reason'] | 'error'
  message?: string
  toolCount?: number
}

// Cheap end-to-end proof the Connection works: sign-in valid (refreshing if due) and the server
// answers tools/list. Run at the start of every workflow that acts through a Connection.
export async function checkConnection(providerId: ProviderId): Promise<ConnectionCheck> {
  try {
    const {tools} = await withMcpClient(providerId, (client) => client.listTools())
    markConnection(providerId, {lastCheckedAt: new Date().toISOString(), lastError: null})
    return {ok: true, toolCount: tools.length}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof ConnectionError) return {ok: false, reason: error.reason, message}
    if (getConnectionRow(providerId)) markConnection(providerId, {lastError: message})
    return {ok: false, reason: 'error', message}
  }
}
