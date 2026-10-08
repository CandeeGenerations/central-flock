import {AI_MODELS, effortConfig} from '../lib/ai-models.js'
import {createMessage} from '../lib/anthropic-client.js'

export interface QuoteTags {
  summary: string
  tags: string[]
}

// Thrown when the reply isn't the JSON object we asked for; carries the raw reply for the 500 body.
export class QuoteTagsParseError extends Error {
  constructor(readonly raw: string) {
    super('AI returned invalid JSON')
  }
}

// Parses the reply into {summary, tags}; null when it isn't valid JSON.
export function parseQuoteTagsResponse(raw: string): QuoteTags | null {
  // Strip markdown code fences if the model wraps its response (e.g. ```json ... ```)
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  let parsed: {summary: string; hashtags: string}
  try {
    parsed = JSON.parse(cleaned) as {summary: string; hashtags: string}
  } catch {
    return null
  }

  // Parse space-separated "#Tag #Multi Word Tag" into ["Tag", "Multi Word Tag"]
  // Split on occurrences of " #" (space then hash), handle the leading # on the first token
  const hashtagsStr = String(parsed.hashtags ?? '')
  const tags = hashtagsStr
    .split(/ (?=#)/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)

  return {summary: parsed.summary ?? '', tags}
}

export async function generateQuoteTags(quoteText: string): Promise<QuoteTags> {
  const message = await createMessage('quote-tags', {
    model: AI_MODELS.haiku,
    max_tokens: 2048,
    ...effortConfig(AI_MODELS.haiku, 'low'),
    messages: [
      {
        role: 'user',
        content: `Here is a quote:\n\n${quoteText.trim()}\n\nRespond with ONLY a JSON object (no markdown, no backticks, no explanation) with these two fields:\n- "summary": Summarize this quote in 1-2 sentences without including words such as "This passage describes". Just include the summary.\n- "hashtags": A space-separated string of relevant hashtags (each starting with #) based on the content so it can be quickly searched by topic, theme, and application. Example format: #Faith #Suffering #Hope #ChristianLiving`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : ''
  const result = parseQuoteTagsResponse(raw)
  if (!result) throw new QuoteTagsParseError(raw)
  return result
}
