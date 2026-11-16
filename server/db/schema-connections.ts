import {sql} from 'drizzle-orm'
import {blob, sqliteTable, text} from 'drizzle-orm/sqlite-core'

// A Connection is a saved sign-in to an outside service Central Flock acts through (Canva,
// Metricool). One row per provider. `secrets` is an AES-256-GCM blob (CONNECTIONS_KEY) holding the
// OAuth tokens, any dynamically registered client, and cached discovery state — never plaintext.
export const connections = sqliteTable('connections', {
  provider: text('provider').primaryKey(),
  secrets: blob('secrets', {mode: 'buffer'}).notNull(),
  // ISO timestamp the access token expires, derived from `expires_in` when it was saved.
  expiresAt: text('expires_at'),
  // 'connected' until a refresh is rejected; then 'needs_reconnect' until the user signs in again.
  status: text('status', {enum: ['connected', 'needs_reconnect']})
    .notNull()
    .default('connected'),
  lastError: text('last_error'),
  lastCheckedAt: text('last_checked_at'),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
