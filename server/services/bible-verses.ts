import {AI_MODELS, effortConfig} from '../lib/ai-models.js'
import {createMessage} from '../lib/anthropic-client.js'

const SYSTEM_PROMPT = `You analyze YouTube video transcripts to identify Bible verse references.

First, look ONLY for direct references — places where the speaker explicitly names a Bible book, chapter, and/or verse (e.g., "John 3:16", "Romans chapter 8", "in First Corinthians Paul says..."), or directly reads/quotes scripture by name.

If you find direct references, list ONLY those. Do NOT include indirect or paraphrased references.

If and ONLY if there are NO direct references at all, then look for indirect/paraphrased references where the speaker is clearly alluding to a specific Bible passage without naming it.

For each verse found, provide:
1. The Bible reference (book, chapter, verse)
2. The approximate timestamp where it's mentioned
3. A brief snippet of what the speaker said

Format your response as a clean, readable list. If no Bible verses are found at all (direct or indirect), say so.`

// Finds Bible references in a "[m:ss] text" transcript. Returns Claude's readable list as-is.
export async function findBibleVerses(timestampedTranscript: string): Promise<string> {
  const message = await createMessage('bible-verses', {
    model: AI_MODELS.sonnet,
    max_tokens: 8192,
    ...effortConfig(AI_MODELS.sonnet, 'low'),
    system: SYSTEM_PROMPT,
    messages: [{role: 'user', content: `TRANSCRIPT:\n${timestampedTranscript}`}],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}
