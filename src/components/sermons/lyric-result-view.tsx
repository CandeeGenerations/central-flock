import {BookNumberBadge} from '@/components/book-number-badge'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import type {MusicResult} from '@/lib/quotes-api'
import {Copy, ExternalLink} from 'lucide-react'
import {toast} from 'sonner'

function RelevanceBadge({relevance}: {relevance: string}) {
  const variant = relevance === 'high' ? 'default' : relevance === 'medium' ? 'secondary' : ('outline' as const)
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {relevance}
    </Badge>
  )
}

function copyLyric(r: MusicResult) {
  const ref = `${r.book === 'burgundy' ? 'Burgundy' : 'Silver'} #${r.number} — ${r.title}`
  navigator.clipboard.writeText(`${ref}\n\n${r.relevantLyrics}`).then(
    () => toast.success('Copied'),
    () => toast.error('Copy failed'),
  )
}

function LyricCard({result}: {result: MusicResult}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <BookNumberBadge book={result.book} number={result.number} />
            <span className="font-medium">{result.title}</span>
            {result.author && <span className="text-sm text-muted-foreground">· {result.author}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RelevanceBadge relevance={result.relevance} />
            <Button variant="ghost" size="sm" onClick={() => copyLyric(result)}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
          </div>
        </div>
        <p className="text-sm">
          <span className="font-medium">Why: </span>
          {result.note}
        </p>
        <blockquote className="border-l-4 border-border pl-3 whitespace-pre-wrap text-sm font-serif leading-relaxed">
          {result.relevantLyrics}
        </blockquote>
        <div className="flex items-center gap-3 text-xs">
          {!result.verified && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
              unverified — check the book
            </Badge>
          )}
          {result.sourceUrl && (
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function LyricResultView({results}: {results: MusicResult[]}) {
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">No songs found for this topic.</p>
  }
  return (
    <div className="space-y-3">
      {results.map((r) => (
        <LyricCard key={`${r.book}-${r.number}`} result={r} />
      ))}
    </div>
  )
}
