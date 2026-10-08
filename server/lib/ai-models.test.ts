import {describe, expect, it} from 'vitest'

import {
  AI_MODELS,
  AI_MODEL_KEYS,
  DEFAULT_AI_MODEL_KEY,
  LEGACY_MODEL_TO_KEY,
  effortConfig,
  resolveModel,
  webSearchTool,
} from './ai-models.js'

const currentIds = Object.values(AI_MODELS)

describe('AI_MODELS', () => {
  it('has a dateless Claude model ID for every key', () => {
    expect(Object.keys(AI_MODELS).sort()).toEqual([...AI_MODEL_KEYS].sort())
    for (const id of currentIds) {
      expect(id).toMatch(/^claude-[a-z]+-\d/)
      expect(id).not.toMatch(/-\d{8}$/)
    }
  })

  // Catches a half-finished upgrade: the new ID added as legacy, or the old one left current.
  it('never lists a current model ID as legacy', () => {
    for (const id of currentIds) expect(LEGACY_MODEL_TO_KEY).not.toHaveProperty(id)
  })
})

describe('resolveModel', () => {
  it('maps each key to its model ID', () => {
    for (const key of AI_MODEL_KEYS) expect(resolveModel(key)).toBe(AI_MODELS[key])
  })

  it('maps legacy model IDs to the current model for their key', () => {
    for (const [legacy, key] of Object.entries(LEGACY_MODEL_TO_KEY)) {
      expect(resolveModel(legacy)).toBe(AI_MODELS[key])
    }
  })

  it('falls back to the default model for missing or unknown values', () => {
    for (const value of [null, undefined, '', 'gpt-4', 'claude-unknown-9']) {
      expect(resolveModel(value)).toBe(AI_MODELS[DEFAULT_AI_MODEL_KEY])
    }
  })
})

describe('effortConfig', () => {
  it('omits effort for Haiku 4.x, which rejects it', () => {
    expect(effortConfig('claude-haiku-4-5', 'low')).toEqual({})
  })

  it('sets effort for every current model', () => {
    for (const id of currentIds) expect(effortConfig(id, 'low')).toEqual({output_config: {effort: 'low'}})
  })
})

describe('webSearchTool', () => {
  it('uses the basic tool for Haiku 4.x', () => {
    expect(webSearchTool('claude-haiku-4-5', 3)).toMatchObject({type: 'web_search_20250305', max_uses: 3})
  })

  it('uses the dynamic-filtering tool for every current model', () => {
    for (const id of currentIds) {
      expect(webSearchTool(id, 3)).toMatchObject({type: 'web_search_20260209', max_uses: 3})
    }
  })
})
