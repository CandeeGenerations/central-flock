// MCP tool results arrive as `structuredContent` or as JSON inside a text block. This returns the
// parsed payload, and throws the server's own message when the tool reports an error.

interface ToolResultLike {
  isError?: boolean
  structuredContent?: unknown
  content?: unknown
}

export class ToolCallError extends Error {}

function textOf(result: ToolResultLike): string {
  const blocks = Array.isArray(result.content) ? result.content : []
  return blocks
    .filter((b): b is {type: 'text'; text: string} => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function toolJson<T = unknown>(raw: unknown): T {
  const result = (raw ?? {}) as ToolResultLike
  const text = textOf(result)
  if (result.isError) throw new ToolCallError(text || 'Tool call failed')
  if (result.structuredContent !== undefined) return result.structuredContent as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

// Depth-first search for the first value under `key` anywhere in a tool payload — tolerant of the
// response nesting a server chooses.
export function findKey<T = unknown>(value: unknown, key: string): T | undefined {
  if (value === null || typeof value !== 'object') return undefined
  if (key in value) return (value as Record<string, T>)[key]
  for (const v of Object.values(value)) {
    const found = findKey<T>(v, key)
    if (found !== undefined) return found
  }
  return undefined
}
