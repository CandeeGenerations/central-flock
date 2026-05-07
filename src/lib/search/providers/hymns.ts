import type {SearchProvider} from '@/lib/search/registry'
import {Music} from 'lucide-react'

interface HymnRow {
  id: number
  book: 'burgundy' | 'silver'
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
  author: string | null
  composer: string | null
  tune: string | null
  meter: string | null
  topics: string[]
  scriptureRefs: string[]
  notes: string | null
}

interface HymnsResponse {
  hymns: HymnRow[]
  total: number
}

async function fetchAllHymns(): Promise<HymnRow[]> {
  const res = await fetch(`/api/hymns?pageSize=200&page=1`, {credentials: 'include'})
  if (!res.ok) throw new Error('Failed to load hymns')
  const first = (await res.json()) as HymnsResponse
  const totalPages = Math.ceil(first.total / 200)
  if (totalPages <= 1) return first.hymns
  const remaining = await Promise.all(
    Array.from({length: totalPages - 1}, (_, i) =>
      fetch(`/api/hymns?pageSize=200&page=${i + 2}`, {credentials: 'include'})
        .then((r) => r.json() as Promise<HymnsResponse>)
        .then((d) => d.hymns),
    ),
  )
  return [first.hymns, ...remaining].flat()
}

export const hymnsProvider: SearchProvider<HymnRow> = {
  id: 'hymns',
  label: 'Hymns',
  icon: Music,
  priority: 72,
  queryKey: ['hymns', 'search-index'] as const,
  fetch: fetchAllHymns,
  toItems: (rows) =>
    rows.map((h) => {
      const bookLabel = h.book === 'burgundy' ? 'Burgundy' : 'Silver'
      return {
        id: `hymns-${h.id}`,
        label: h.title,
        subtitle: [`${bookLabel} #${h.number}`, h.author ?? undefined, h.firstLine ?? undefined]
          .filter(Boolean)
          .join(' · '),
        group: 'Hymns',
        icon: Music,
        keywords: [
          h.title,
          h.firstLine ?? '',
          h.refrainLine ?? '',
          h.author ?? '',
          h.composer ?? '',
          h.tune ?? '',
          ...h.topics,
          ...h.scriptureRefs,
        ].filter(Boolean),
        action: ({navigate, close}) => {
          navigate(`/music/hymns?highlight=${h.id}`)
          close()
        },
      }
    }),
}
