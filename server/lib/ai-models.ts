import type Anthropic from '@anthropic-ai/sdk'

// Abstract model keys stored in the DB and referenced throughout the app.
// Update the right-hand side when a new model version ships — nothing else needs to change.
export const AI_MODELS = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
  haiku: 'claude-haiku-4-5',
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
  'claude-opus-4-5': 'opus',
  'claude-opus-4-6': 'opus',
  'claude-opus-4-7': 'opus',
  'claude-opus-4-8': 'opus',
  'claude-haiku-4-5-20251001': 'haiku',
}

// The dynamic-filtering web search tool needs Opus 4.6+ / Sonnet 4.6+; Haiku 4.5 only
// supports the basic variant, so pick the newest one the configured model can run.
export function webSearchTool(model: string, maxUses: number): Anthropic.ToolUnion {
  if (model.startsWith('claude-haiku-')) {
    return {type: 'web_search_20250305', name: 'web_search', max_uses: maxUses}
  }
  return {type: 'web_search_20260209', name: 'web_search', max_uses: maxUses}
}

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// Sonnet 5 / Opus 5 think adaptively unless told otherwise, which eats into max_tokens
// and costs. Pin the effort per call site instead of taking the "high" default.
// Haiku 4.5 rejects output_config.effort, so omit it there.
export function effortConfig(model: string, effort: AiEffort): {output_config?: Anthropic.OutputConfig} {
  if (model.startsWith('claude-haiku-')) return {}
  return {output_config: {effort}}
}
