import Anthropic from '@anthropic-ai/sdk'

import {assertOutboundAllowed, isSandbox} from './sandbox.js'

// Every Claude call goes through createMessage so the AI smoke tests (server/test/) can see each
// response's model, stop_reason and usage — services only return parsed results. No listeners in prod.

export interface AiResponseInfo {
  label: string
  model: string
  stopReason: Anthropic.StopReason | null
  usage: Anthropic.Usage
  text: string
}

type AiResponseListener = (info: AiResponseInfo) => void

const listeners = new Set<AiResponseListener>()
let client: Anthropic | null = null

// False in a sandbox too, so optional AI steps (e.g. the Scripture Check fallback) skip quietly.
export function hasAnthropicKey(): boolean {
  return !isSandbox() && Boolean(process.env.ANTHROPIC_API_KEY)
}

export function requireAnthropicKey(): void {
  // Features call this before building a prompt; in a sandbox say why AI is off, not "no key".
  assertOutboundAllowed('anthropic', 'AI')
  if (!hasAnthropicKey()) throw new Error('ANTHROPIC_API_KEY environment variable is not set')
}

export function getAnthropic(): Anthropic {
  requireAnthropicKey()
  client ??= new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY})
  return client
}

// Returns an unsubscribe fn.
export function onAiResponse(listener: AiResponseListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function createMessage(
  label: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  assertOutboundAllowed('anthropic', `AI (${label})`)
  const message = await getAnthropic().messages.create(params)
  if (listeners.size > 0) {
    const info: AiResponseInfo = {
      label,
      model: message.model,
      stopReason: message.stop_reason,
      usage: message.usage,
      text: message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(''),
    }
    for (const listener of listeners) listener(info)
  }
  return message
}
