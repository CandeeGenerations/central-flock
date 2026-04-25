import type {SearchItem} from './registry'

// A precomputed index over SearchItem[]. Each item gets one concatenated
// lowercase "haystack" string built once at index time. `search()` is then a
// pure substring scan — no tokenization, no scoring heuristics — which for the
// sizes this palette deals with (a few thousand items) finishes in a handful
// of milliseconds vs. ~100-300ms for Fuse with `ignoreLocation: true`.
export class SearchIndex {
  private readonly items: SearchItem[]
  private readonly labels: string[]
  private readonly haystacks: string[]

  constructor(items: SearchItem[]) {
    this.items = items
    this.labels = new Array(items.length)
    this.haystacks = new Array(items.length)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      this.labels[i] = item.label.toLowerCase()
      this.haystacks[i] = `${item.label} ${item.keywords.join(' ')} ${item.subtitle ?? ''}`.toLowerCase()
    }
  }

  search(query: string, limit: number): SearchItem[] {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []

    // Per item score = sum of earliest-match positions across each query word,
    // with a big bonus if the match lands in the label (what users search for
    // most). Lower score = better.
    const scored: {index: number; score: number}[] = []
    itemLoop: for (let i = 0; i < this.items.length; i++) {
      const hay = this.haystacks[i]
      const label = this.labels[i]
      let score = 0
      for (const w of words) {
        const hayIdx = hay.indexOf(w)
        if (hayIdx < 0) continue itemLoop
        const labelIdx = label.indexOf(w)
        score += labelIdx >= 0 ? labelIdx : 1000 + hayIdx
      }
      scored.push({index: i, score})
    }

    scored.sort((a, b) => a.score - b.score)
    const out = new Array(Math.min(scored.length, limit)) as SearchItem[]
    for (let i = 0; i < out.length; i++) out[i] = this.items[scored[i].index]
    return out
  }
}

export function buildSearchIndex(items: SearchItem[]): SearchIndex {
  return new SearchIndex(items)
}
