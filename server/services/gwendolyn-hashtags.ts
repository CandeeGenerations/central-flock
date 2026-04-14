import Anthropic from '@anthropic-ai/sdk'
import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return row?.value ?? 'claude-sonnet-4-20250514'
}

const SYSTEM_PROMPT =
  'You are a social media expert. I will give you a post. Generate some social media hashtags to go along with it. Only return the hashtags. Exclude "Faith", "God", and "Prayer". Only return 10-15 hashtags.'

export async function generateHashtags(deriveText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  const model = getConfiguredModel()
  const client = new Anthropic({apiKey})

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{role: 'user', content: deriveText}],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return textBlock.text.trim()
}
