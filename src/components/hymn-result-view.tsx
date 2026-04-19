import {Badge} from '@/components/ui/badge'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import type {HymnBook, HymnPick, HymnSuggestionSections} from '@/lib/hymns-api'
import {cn} from '@/lib/utils'

function BookNumberBadge({book, number}: {book: HymnBook; number: number}) {
  const label = `${book === 'burgundy' ? 'Burgundy' : 'Silver'} #${number}`
  return (
    <Badge
      className={cn(
        book === 'burgundy'
          ? 'bg-red-900 text-white border-red-950'
          : 'bg-zinc-300 text-zinc-900 border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900',
      )}
    >
      {label}
    </Badge>
  )
}

function HymnPickCard({pick, label}: {pick: HymnPick; label?: string}) {
  return (
    <div className="space-y-2 border rounded-md p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BookNumberBadge book={pick.book} number={pick.number} />
          <span className="font-medium">{pick.title}</span>
        </div>
        {label && (
          <Badge variant="outline" className="text-xs">
            {label}
          </Badge>
        )}
      </div>
      <p className="text-sm">
        <span className="font-medium">Why: </span>
        {pick.why}
      </p>
      {pick.lyricSnippet && (
        <blockquote className="border-l-4 border-border pl-3 whitespace-pre-wrap text-sm font-serif leading-relaxed text-muted-foreground">
          {pick.lyricSnippet}
        </blockquote>
      )}
    </div>
  )
}

function SectionCard({title, subtitle, children}: {title: string; subtitle?: string; children: React.ReactNode}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

export function HymnResultView({sections}: {sections: HymnSuggestionSections}) {
  return (
    <div className="space-y-4">
      <SectionCard title="Opening" subtitle="Upbeat, sets the tone">
        <HymnPickCard pick={sections.opening} />
      </SectionCard>

      <SectionCard
        title="Congregational Hymns"
        subtitle={`Build toward the message (${sections.congregational.length})`}
      >
        {sections.congregational.map((p) => (
          <HymnPickCard key={p.hymnId} pick={p} />
        ))}
      </SectionCard>

      {sections.alternate && (
        <SectionCard title="Alternate / Secondary" subtitle="If you lean a different direction">
          <HymnPickCard pick={sections.alternate} />
        </SectionCard>
      )}

      <SectionCard title="Special Music" subtitle={`Solo or ensemble options (${sections.special.length})`}>
        {sections.special.map((p) => (
          <HymnPickCard key={p.hymnId} pick={p} />
        ))}
      </SectionCard>

      <SectionCard title="Invitation" subtitle="Matches the appeal">
        <HymnPickCard pick={sections.invitation.primary} />
        {sections.invitation.alternate && <HymnPickCard pick={sections.invitation.alternate} label="Alternate" />}
      </SectionCard>

      <SectionCard title="Recommended Flow" subtitle="Full service order">
        <ol className="space-y-2">
          {sections.flow.map((f) => (
            <li key={f.step} className="flex gap-3 items-center">
              <span className="text-sm font-mono text-muted-foreground w-6 shrink-0">{f.step}.</span>
              <span className="text-sm flex-1">{f.label}</span>
              {f.hymnId !== undefined &&
                (() => {
                  const pick = findFlowPick(sections, f.hymnId!)
                  return pick ? <BookNumberBadge book={pick.book} number={pick.number} /> : null
                })()}
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  )
}

function findFlowPick(sections: HymnSuggestionSections, hymnId: number): HymnPick | null {
  if (sections.opening.hymnId === hymnId) return sections.opening
  const c = sections.congregational.find((p) => p.hymnId === hymnId)
  if (c) return c
  if (sections.alternate?.hymnId === hymnId) return sections.alternate
  const s = sections.special.find((p) => p.hymnId === hymnId)
  if (s) return s
  if (sections.invitation.primary.hymnId === hymnId) return sections.invitation.primary
  if (sections.invitation.alternate?.hymnId === hymnId) return sections.invitation.alternate
  return null
}
