import type {OAuthDiscoveryState} from '@modelcontextprotocol/sdk/client/auth.js'
import type {OAuthClientInformationMixed, OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js'
import {eq, sql} from 'drizzle-orm'

import {db, schema} from '../../db/index.js'
import {decryptJson, encryptJson} from './crypto.js'
import type {ProviderId} from './providers.js'

// Everything secret about one Connection, encrypted as a single blob. Values the SDK hands to
// saveTokens()/saveClientInformation() are stored unchanged (they carry the `issuer` stamp the SDK
// relies on to never present a token to the wrong authorization server).
export interface ConnectionSecrets {
  tokens?: OAuthTokens
  clientInformation?: OAuthClientInformationMixed
  discoveryState?: OAuthDiscoveryState
}

export type ConnectionRow = typeof schema.connections.$inferSelect

export function getConnectionRow(provider: ProviderId): ConnectionRow | undefined {
  return db.select().from(schema.connections).where(eq(schema.connections.provider, provider)).get()
}

export function loadSecrets(provider: ProviderId): ConnectionSecrets {
  const row = getConnectionRow(provider)
  return row ? decryptJson<ConnectionSecrets>(row.secrets) : {}
}

export function saveSecrets(
  provider: ProviderId,
  secrets: ConnectionSecrets,
  extra: Partial<Pick<ConnectionRow, 'expiresAt' | 'status' | 'lastError'>> = {},
): void {
  const blob = encryptJson(secrets)
  db.insert(schema.connections)
    .values({provider, secrets: blob, ...extra})
    .onConflictDoUpdate({
      target: schema.connections.provider,
      set: {secrets: blob, ...extra, updatedAt: sql`datetime('now')`},
    })
    .run()
}

export function markConnection(
  provider: ProviderId,
  fields: Partial<Pick<ConnectionRow, 'status' | 'lastError' | 'lastCheckedAt'>>,
): void {
  db.update(schema.connections)
    .set({...fields, updatedAt: sql`datetime('now')`})
    .where(eq(schema.connections.provider, provider))
    .run()
}

export function deleteConnection(provider: ProviderId): void {
  db.delete(schema.connections).where(eq(schema.connections.provider, provider)).run()
}
