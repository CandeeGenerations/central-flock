import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {effortConfig, resolveModel} from '../lib/ai-models.js'
import {createMessage, requireAnthropicKey} from '../lib/anthropic-client.js'

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

const SYSTEM_PROMPT =
  'You are a social media expert. I will give you a post. Generate some social media hashtags to go along with it. Only return the hashtags. Exclude "Faith", "God", and "Prayer". Only return 10-15 hashtags.'

export async function generateHashtags(deriveText: string): Promise<string> {
  requireAnthropicKey()

  const model = getConfiguredModel()

  const response = await createMessage('gwendolyn-hashtags', {
    model,
    max_tokens: 2048,
    ...effortConfig(model, 'low'),
    system: SYSTEM_PROMPT,
    messages: [{role: 'user', content: deriveText}],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return textBlock.text.trim()
}
