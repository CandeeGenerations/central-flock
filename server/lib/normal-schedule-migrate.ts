export type ParsedItem = {
  type: 'line' | 'spacer'
  text: string
  bold: boolean
  column: 1 | 2
  eligibleDays: string
  sortOrder: number
}

function guessEligibleDays(text: string): string {
  const t = text.toLowerCase()
  const days: string[] = []
  if (/wed|wednesday|prayer time/i.test(t)) days.push('wed')
  if (/sat|saturday|cleaning|visitation/i.test(t)) days.push('sat')
  if (/sunday|sunday morning|sunday evening|sunday school|kaya|alive|choir|men's prayer/i.test(t)) days.push('sun')
  if (days.length === 0) return 'sun,wed,sat'
  return days.join(',')
}

// Convert a freeform Normal Schedule blob into structured items.
// Preserves `**inline bold**` markers in the text so existing parseScheduleLine
// rendering works unchanged. Single-line-wrapping `**foo**` collapses to bold=true.
export function parseBlobToItems(blob: string): ParsedItem[] {
  const lines = blob.split('\n')
  const sepIdx = lines.findIndex((l) => /^-{3,}\s*$/.test(l.trim()))
  const col1 = sepIdx === -1 ? lines : lines.slice(0, sepIdx)
  const col2 = sepIdx === -1 ? [] : lines.slice(sepIdx + 1)

  const items: ParsedItem[] = []
  let sortOrder = 0
  const push = (line: string, column: 1 | 2) => {
    sortOrder += 10
    const trimmed = line.trim()
    if (!trimmed) {
      items.push({type: 'spacer', text: '', bold: false, column, eligibleDays: 'sun,wed,sat', sortOrder})
      return
    }
    const fullBold = /^\*\*([^*]+)\*\*$/.exec(trimmed)
    if (fullBold) {
      items.push({
        type: 'line',
        text: fullBold[1],
        bold: true,
        column,
        eligibleDays: guessEligibleDays(fullBold[1]),
        sortOrder,
      })
      return
    }
    items.push({type: 'line', text: line, bold: false, column, eligibleDays: guessEligibleDays(line), sortOrder})
  }
  col1.forEach((l) => push(l, 1))
  col2.forEach((l) => push(l, 2))
  return items
}

// Reverse: convert structured items back into the column-string-arrays that
// FooterContent / ScheduleColumn expect today. Spacers emit '' lines.
export function itemsToColumns(items: ParsedItem[] | {type: string; text: string; bold: boolean; column: number}[]): {
  col1: string[]
  col2: string[]
} {
  const col1: string[] = []
  const col2: string[] = []
  for (const it of items) {
    const target = it.column === 2 ? col2 : col1
    if (it.type === 'spacer') {
      target.push('')
      continue
    }
    if (it.bold && !/\*\*/.test(it.text)) {
      target.push(`**${it.text}**`)
    } else {
      target.push(it.text)
    }
  }
  return {col1, col2}
}
