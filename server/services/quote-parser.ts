export interface ParsedQuote {
  externalId: string
  title: string
  author: string // cited author (from ◇ line, fallback YAML)
  capturedBy: string // raw YAML/webhook author
  capturedAt: string // ISO 8601 if parseable, else raw
  dateDisplay: string // free-form display date
  summary: string
  quoteText: string
  tags: string[] // deduplicated, without '#'
  source: 'n8n' | 'import' | 'manual'
}

/**
 * Extracts the cited author from the ◇ attribution line near the end of a quote body.
 * Returns the display name before any comma or open paren, or null if no ◇ line is found.
 *
 * Examples:
 *   "◇ Miguel de Cervantes, \"Don Quixote\"" → "Miguel de Cervantes"
 *   "◇ Dr. Jerry Scheidbach, Pastor of..." → "Dr. Jerry Scheidbach"
 *   "◇ Pastor Melito Barrera (Berean...)" → "Pastor Melito Barrera"
 */
export function extractCitedAuthor(quoteText: string): string | null {
  const lines = quoteText.split('\n')
  // Scan bottom-up — the attribution line is usually at the end.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\s*◇\s*(.+?)\s*$/)
    if (!m) continue
    const after = m[1]
    // Cut at the first comma or open paren (strips affiliations / source books).
    const cut = after.search(/[,(]/)
    return (cut === -1 ? after : after.slice(0, cut)).trim()
  }
  return null
}

/**
 * Attempts to parse a date string to an ISO 8601 date-time string.
 * Returns the original string if parsing fails.
 */
function toIso(raw: string): string {
  // Try to parse e.g. "Apr 13, 2026 at 14:01" or ISO-ish strings
  const d = new Date(raw.replace(' at ', ' '))
  if (!isNaN(d.getTime())) return d.toISOString()
  return raw
}

/**
 * Parses a markdown document (YAML frontmatter + ## sections) into a ParsedQuote.
 * Returns null if the document is malformed.
 */
export function parseQuoteMarkdown(
  markdown: string,
  externalId: string,
  source: 'import' | 'n8n' | 'manual' = 'import',
): ParsedQuote | null {
  try {
    // Extract YAML frontmatter between --- delimiters
    const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
    if (!fmMatch) return null
    const fm = fmMatch[1]

    const titleMatch = fm.match(/^title:\s*(.+)$/m)
    const authorMatch = fm.match(/^author:\s*(.+)$/m)
    const dateMatch = fm.match(/^date:\s*(.+)$/m)

    const yamlTitle = titleMatch ? titleMatch[1].trim().replace(/^['"]|['"]$/g, '') : ''
    const yamlAuthor = authorMatch ? authorMatch[1].trim().replace(/^['"]|['"]$/g, '') : ''
    const yamlDate = dateMatch ? dateMatch[1].trim().replace(/^['"]|['"]$/g, '') : ''

    if (!yamlTitle) return null

    // Split body into sections
    const body = markdown.slice(fmMatch[0].length)
    const summaryMatch = body.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##\s|$)/i)
    const quoteMatch = body.match(/##\s*Quote\s*\n([\s\S]*?)(?=\n##\s|$)/i)
    const metadataMatch = body.match(/##\s*Metadata\s*\n([\s\S]*?)(?=\n##\s|$)/i)

    const summaryText = summaryMatch ? summaryMatch[1].trim() : ''
    const quoteText = quoteMatch ? quoteMatch[1].trim() : ''
    const metadataText = metadataMatch ? metadataMatch[1].trim() : ''

    if (!summaryText || !quoteText) return null

    // Extract tags from ## Metadata section (#Tag format)
    const tagMatches = metadataText.match(/#([A-Za-z0-9_]+)/g) ?? []
    const tags = [...new Set(tagMatches.map((t) => t.slice(1)))]

    // Resolve author: cited author from ◇ line takes priority over YAML
    const citedAuthor = extractCitedAuthor(quoteText)
    const author = citedAuthor ?? yamlAuthor

    return {
      externalId,
      title: yamlTitle,
      author,
      capturedBy: yamlAuthor,
      capturedAt: toIso(yamlDate),
      dateDisplay: yamlDate,
      summary: summaryText,
      quoteText,
      tags,
      source,
    }
  } catch {
    return null
  }
}
