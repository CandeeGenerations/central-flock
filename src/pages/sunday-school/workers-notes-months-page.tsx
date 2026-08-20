import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {
  type HymnOption,
  fetchWorkersNotesEdition,
  saveWorkersNotesMonths,
  searchHymns,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {MONTH_NAMES, hymnRefLabel} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {X} from 'lucide-react'
import {useState} from 'react'
import {useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {EditShell} from './edit-shell'

interface MonthDraft {
  month: number
  hymnId: number | null
  hymnBook: 'burgundy' | 'silver' | null
  hymnNumber: number | null
  hymnTitle: string | null
  songTitleOverride: string
  motto: string
  verse: string
}

/**
 * The four months' Song, Motto and Verse. Song is a hymn reference plus an
 * optional title override, so the printed (B-###) can't be wrong while the
 * house wording ("The Winning Side") still prints.
 */
export function WorkersNotesMonthsPage() {
  const editionId = Number(useParams<{id: string}>().id)
  const queryClient = useQueryClient()

  const {data: edition} = useQuery({
    queryKey: workersNotesKeys.detail(editionId),
    queryFn: () => fetchWorkersNotesEdition(editionId),
    enabled: Number.isFinite(editionId),
  })

  const save = useMutation({
    mutationFn: (months: MonthDraft[]) =>
      saveWorkersNotesMonths(
        editionId,
        months.map((m) => ({
          month: m.month,
          hymnId: m.hymnId,
          songTitleOverride: m.songTitleOverride.trim() || null,
          motto: m.motto,
          verse: m.verse,
        })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      toast.success('Months saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (!edition) return <PageSpinner />

  return (
    <EditShell
      editionId={editionId}
      title="Songs, Mottos, and Verses"
      subtitle="The Motto prints on both pages — as the motto here on page 2, and as that month's theme on page 1."
    >
      <MonthsForm
        key={edition.updatedAt}
        initial={edition.months.map((m) => ({
          month: m.month,
          hymnId: m.hymnId,
          hymnBook: m.hymnBook,
          hymnNumber: m.hymnNumber,
          hymnTitle: m.hymnTitle,
          songTitleOverride: m.songTitleOverride ?? '',
          motto: m.motto,
          verse: m.verse,
        }))}
        saving={save.isPending}
        onSave={(months) => save.mutate(months)}
      />
    </EditShell>
  )
}

function MonthsForm({
  initial,
  saving,
  onSave,
}: {
  initial: MonthDraft[]
  saving: boolean
  onSave: (months: MonthDraft[]) => void
}) {
  const [months, setMonths] = useState<MonthDraft[]>(initial)
  const update = (month: number, patch: Partial<MonthDraft>) =>
    setMonths((prev) => prev.map((m) => (m.month === month ? {...m, ...patch} : m)))

  return (
    <div className="max-w-3xl space-y-4">
      {months.map((m) => (
        <Card key={m.month}>
          <CardHeader>
            <CardTitle>{MONTH_NAMES[m.month - 1]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Song</Label>
              <HymnPicker
                selected={
                  m.hymnId != null && m.hymnBook && m.hymnNumber != null
                    ? {id: m.hymnId, book: m.hymnBook, number: m.hymnNumber, title: m.hymnTitle ?? ''}
                    : null
                }
                onPick={(h) =>
                  update(m.month, {
                    hymnId: h?.id ?? null,
                    hymnBook: h?.book ?? null,
                    hymnNumber: h?.number ?? null,
                    hymnTitle: h?.title ?? null,
                  })
                }
              />
              <Input
                value={m.songTitleOverride}
                onChange={(e) => update(m.month, {songTitleOverride: e.target.value})}
                placeholder={m.hymnTitle ? `Print as… (default: ${m.hymnTitle})` : 'Song title'}
              />
              <p className="text-muted-foreground text-xs">
                Prints as{' '}
                <span className="font-medium">
                  {(m.songTitleOverride.trim() || m.hymnTitle || '—') +
                    (m.hymnBook && m.hymnNumber != null ? ` ${hymnRefLabel(m.hymnBook, m.hymnNumber)}` : '')}
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Motto</Label>
              <Input
                value={m.motto}
                onChange={(e) => update(m.month, {motto: e.target.value})}
                placeholder="Rejoice that…"
              />
              <p className="text-muted-foreground text-xs">
                Prints verbatim on both pages — type it in the casing you want.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Verse</Label>
              <Input
                value={m.verse}
                onChange={(e) => update(m.month, {verse: e.target.value})}
                placeholder="Psalm 33:12"
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <Button onClick={() => onSave(months)} disabled={saving}>
        Save months
      </Button>
    </div>
  )
}

function HymnPicker({selected, onPick}: {selected: HymnOption | null; onPick: (h: HymnOption | null) => void}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const {data: results} = useQuery({
    queryKey: workersNotesKeys.hymns(q),
    queryFn: () => searchHymns(q),
    enabled: open,
  })

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="bg-muted rounded px-2 py-1 text-sm">
          {selected.title} {hymnRefLabel(selected.book, selected.number)}
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onPick(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search the hymnal by title or number…"
      />
      {open && results?.length ? (
        <div className="max-h-48 overflow-y-auto rounded-md border">
          {results.map((h) => (
            <button
              key={h.id}
              type="button"
              className="hover:bg-muted/60 block w-full px-3 py-1.5 text-left text-sm"
              onClick={() => {
                onPick(h)
                setOpen(false)
                setQ('')
              }}
            >
              {h.title} <span className="text-muted-foreground">{hymnRefLabel(h.book, h.number)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
