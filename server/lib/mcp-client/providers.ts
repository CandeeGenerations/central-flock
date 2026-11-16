// Registry of MCP servers Central Flock connects to. Design- or feature-specific knowledge (design
// IDs, element locators, brand IDs) does NOT belong here — only how to reach and sign in to each one.

export type ProviderId = 'canva' | 'metricool'

export interface McpProvider {
  id: ProviderId
  label: string
  serverUrl: string
  // Pre-registered OAuth client (Developer Portal). When absent the SDK registers dynamically.
  preRegisteredClient?: () => {client_id: string; client_secret?: string} | undefined
  // Env vars that must be set for this provider to be usable at all.
  requiredEnv: string[]
}

export const PROVIDERS: Record<ProviderId, McpProvider> = {
  canva: {
    id: 'canva',
    label: 'Canva',
    serverUrl: 'https://api.canva.com/connect/v1/mcp',
    preRegisteredClient: () => {
      const clientId = process.env.CANVA_CLIENT_ID
      if (!clientId) return undefined
      return {client_id: clientId, client_secret: process.env.CANVA_CLIENT_SECRET}
    },
    requiredEnv: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'],
  },
  metricool: {
    id: 'metricool',
    label: 'Metricool',
    serverUrl: 'https://ai.metricool.com/mcp',
    requiredEnv: [],
  },
}

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS
}

export function missingEnv(provider: McpProvider): string[] {
  return [...provider.requiredEnv, 'CONNECTIONS_KEY'].filter((name) => !process.env[name])
}
