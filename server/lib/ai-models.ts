// Abstract model keys stored in the DB and referenced throughout the app.
// Update the right-hand side when a new model version ships — nothing else needs to change.
export const AI_MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
} as const

export type AiModelKey = keyof typeof AI_MODELS

export const AI_MODEL_KEYS: AiModelKey[] = ['sonnet', 'opus', 'haiku']

export const DEFAULT_AI_MODEL_KEY: AiModelKey = 'sonnet'

export function isAiModelKey(value: unknown): value is AiModelKey {
  return typeof value === 'string' && value in AI_MODELS
}

// Maps any stored value (enum key or legacy exact model ID) to a concrete model ID.
export function resolveModel(stored: string | undefined | null): string {
  if (isAiModelKey(stored)) return AI_MODELS[stored]
  const migrated = LEGACY_MODEL_TO_KEY[stored ?? '']
  if (migrated) return AI_MODELS[migrated]
  return AI_MODELS[DEFAULT_AI_MODEL_KEY]
}

// Legacy exact model IDs that may be sitting in the DB from earlier versions.
export const LEGACY_MODEL_TO_KEY: Record<string, AiModelKey> = {
  'claude-sonnet-4-20250514': 'sonnet',
  'claude-sonnet-4-5-20250514': 'sonnet',
  'claude-sonnet-4-5': 'sonnet',
  'claude-sonnet-4-6': 'sonnet',
  'claude-opus-4-20250514': 'opus',
  'claude-opus-4-7': 'opus',
  'claude-haiku-4-5-20251001': 'haiku',
}
