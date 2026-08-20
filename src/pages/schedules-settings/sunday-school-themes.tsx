import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Textarea} from '@/components/ui/textarea'
import {type YearlyTheme, fetchYearlyThemes, saveYearlyTheme, workersNotesKeys} from '@/lib/workers-notes-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Plus} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

type ThemeFields = Omit<YearlyTheme, 'id' | 'year'>

const EMPTY: ThemeFields = {
  songTitle: '',
  songCredit: '',
  chorusLyrics: '',
  tagLyrics: '',
  verseText: '',
  verseRef: '',
  growthPlan: '',
}

// One row per calendar year, shared by all three editions of that year — so the
// chorus is typed once and an old edition re-exports with the theme it was
// printed with rather than the current one.
export function SundaySchoolThemesPane() {
  const queryClient = useQueryClient()
  const {data: themes, isLoading} = useQuery({queryKey: workersNotesKeys.themes, queryFn: fetchYearlyThemes})
  // Selection is derived rather than stored, so it can't go stale when the
  // list refetches after a save.
  // null = list view. A year number opens that year's form; -1 returns to the
  // list without clearing which year was last opened.
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const selected = pickedYear == null || pickedYear < 0 ? null : (themes?.find((t) => t.year === pickedYear) ?? null)

  const save = useMutation({
    mutationFn: ({year, body}: {year: number; body: ThemeFields}) => saveYearlyTheme(year, body),
    onSuccess: (row) => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.themes})
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      setPickedYear(row.year)
      toast.success(`${row.year} theme saved`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (isLoading) return <PageSpinner />

  // A new year starts from the most recent one — the shape (chorus, tag, verse)
  // is stable even though every word changes.
  function addNextYear() {
    const latest = themes?.[themes.length - 1]
    const year = latest ? latest.year + 1 : new Date().getFullYear()
    if (themes?.some((t) => t.year === year)) return
    const seed: ThemeFields = latest
      ? {...latest, songTitle: '', songCredit: '', chorusLyrics: '', tagLyrics: ''}
      : EMPTY
    save.mutate({year, body: seed})
  }

  // One row per year, so a couple of decades of themes stay scannable. Picking
  // a year swaps the list for that year's form.
  if (selected) {
    return (
      <div className="max-w-2xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setPickedYear(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          All years
        </Button>
        <ThemeForm
          key={selected.year}
          theme={selected}
          saving={save.isPending}
          onSave={(body) => save.mutate({year: selected.year, body})}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">One theme per year, shared by all three editions of that year.</p>
        <Button size="sm" variant="outline" onClick={addNextYear} disabled={save.isPending}>
          <Plus className="mr-1 h-4 w-4" />
          Add year
        </Button>
      </div>

      {themes?.length ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Year</TableHead>
                <TableHead>Theme song</TableHead>
                <TableHead className="hidden sm:table-cell">Verse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...themes]
                .sort((a, b) => b.year - a.year)
                .map((t) => (
                  <TableRow
                    key={t.year}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => setPickedYear(t.year)}
                  >
                    <TableCell className="font-medium">{t.year}</TableCell>
                    <TableCell>{t.songTitle || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">{t.verseRef || '—'}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No themes yet. Add a year to get started.</p>
      )}
    </div>
  )
}

/**
 * Keyed by year, so switching years remounts with fresh initial state instead
 * of syncing props into state through an effect.
 */
function ThemeForm({
  theme,
  saving,
  onSave,
}: {
  theme: YearlyTheme
  saving: boolean
  onSave: (fields: ThemeFields) => void
}) {
  const [fields, setFields] = useState<ThemeFields>(() => ({
    songTitle: theme.songTitle,
    songCredit: theme.songCredit,
    chorusLyrics: theme.chorusLyrics,
    tagLyrics: theme.tagLyrics,
    verseText: theme.verseText,
    verseRef: theme.verseRef,
    growthPlan: theme.growthPlan,
  }))
  const set = <K extends keyof ThemeFields>(key: K, value: ThemeFields[K]) => setFields((f) => ({...f, [key]: value}))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{theme.year} Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Shared by all three {theme.year} editions. Editing it changes every one of them.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Theme song</Label>
            <Input value={fields.songTitle} onChange={(e) => set('songTitle', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Credit</Label>
            <Input
              value={fields.songCredit}
              onChange={(e) => set('songCredit', e.target.value)}
              placeholder="Words &amp; Music by …"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Chorus</Label>
          <Textarea rows={5} value={fields.chorusLyrics} onChange={(e) => set('chorusLyrics', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Tag</Label>
          <Textarea rows={3} value={fields.tagLyrics} onChange={(e) => set('tagLyrics', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Theme verse</Label>
          <Textarea rows={2} value={fields.verseText} onChange={(e) => set('verseText', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Verse reference</Label>
          <Input
            value={fields.verseRef}
            onChange={(e) => set('verseRef', e.target.value)}
            placeholder="Philippians 4:4"
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Growth plan</Label>
          <p className="text-muted-foreground text-xs">
            Prints after &quot;Our growth plan for the year {theme.year} will be:&quot;. Wrap a word in _underscores_ to
            underline it.
          </p>
          <Textarea rows={4} value={fields.growthPlan} onChange={(e) => set('growthPlan', e.target.value)} />
        </div>
        <Button onClick={() => onSave(fields)} disabled={saving}>
          Save {theme.year} theme
        </Button>
      </CardContent>
    </Card>
  )
}
