import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type LessonRowPayload,
  fetchBettyLukensStories,
  fetchWorkersNotesEdition,
  saveWorkersNotesLessons,
  updateWorkersNotesEdition,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {type LessonKind, MAX_LESSON_NUMBER, lessonRowDateLabel, resolveLessonNumbers} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {EditShell} from './edit-shell'

const KIND_LABELS: Record<LessonKind, string> = {
  regular: 'Regular lesson',
  special: 'Special lesson',
  combined: 'Combined service',
  note: 'Note line',
}

export function WorkersNotesLessonsPage() {
  const editionId = Number(useParams<{id: string}>().id)
  const queryClient = useQueryClient()

  const {data: edition} = useQuery({
    queryKey: workersNotesKeys.detail(editionId),
    queryFn: () => fetchWorkersNotesEdition(editionId),
    enabled: Number.isFinite(editionId),
  })
  const {data: stories} = useQuery({queryKey: workersNotesKeys.stories, queryFn: fetchBettyLukensStories})

  const save = useMutation({
    mutationFn: ({rows, start}: {rows: LessonRowPayload[]; start: number}) =>
      updateWorkersNotesEdition(editionId, {startingLessonNumber: start}).then(() =>
        saveWorkersNotesLessons(editionId, rows),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      toast.success('Lessons saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (!edition || !stories) return <PageSpinner />

  return (
    <EditShell
      editionId={editionId}
      title="Lessons"
      subtitle="Regular rows take the next number in sequence; special, combined and note rows take none — so marking a Sunday combined renumbers everything after it."
    >
      <LessonsForm
        key={edition.updatedAt}
        initialRows={edition.lessonRows.map((r) => ({
          kind: r.kind as LessonKind,
          date: r.date ?? null,
          specialLesson: r.specialLesson ?? '',
          text: r.text ?? '',
        }))}
        initialStart={edition.startingLessonNumber}
        storyTitles={new Map(stories.map((s) => [s.number, s.title]))}
        storyPoints={new Map(stories.map((s) => [s.number, s.lastPoints]))}
        saving={save.isPending}
        onSave={(rows, start) => save.mutate({rows, start})}
      />
    </EditShell>
  )
}

function LessonsForm({
  initialRows,
  initialStart,
  storyTitles,
  storyPoints,
  saving,
  onSave,
}: {
  initialRows: LessonRowPayload[]
  initialStart: number
  storyTitles: Map<number, string>
  storyPoints: Map<number, string | null>
  saving: boolean
  onSave: (rows: LessonRowPayload[], start: number) => void
}) {
  const [rows, setRows] = useState<LessonRowPayload[]>(initialRows)
  const [start, setStart] = useState(String(initialStart))

  const startNum = Number(start) || 1
  // Live derived numbering — the whole point of storing only the start.
  const resolved = useMemo(() => resolveLessonNumbers(rows, startNum), [rows, startNum])
  const overflowed = resolved.some((r) => r.overflow)

  const update = (i: number, patch: Partial<LessonRowPayload>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? {...r, ...patch} : r)))
  const move = (i: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev]
      const j = i + delta
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const insertAfter = (i: number, row: LessonRowPayload) =>
    setRows((prev) => [...prev.slice(0, i + 1), row, ...prev.slice(i + 1)])

  return (
    <div className="space-y-4">
      <Card className="max-w-md">
        <CardContent className="space-y-1.5 p-4">
          <Label className="text-sm font-medium">Starting lesson number</Label>
          <Input value={start} onChange={(e) => setStart(e.target.value)} className="w-24" />
          <p className="text-muted-foreground text-xs">
            Continues the previous edition. Every regular number below derives from it.
          </p>
        </CardContent>
      </Card>

      {overflowed ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The sequence runs past lesson {MAX_LESSON_NUMBER}, the last story in the book. The catalogue has come full
            circle — decide whether to start over at 1 or skip what you taught last cycle, then set the starting number
            accordingly.
          </span>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Date</TableHead>
                <TableHead className="w-40">Kind</TableHead>
                <TableHead className="w-24">Lesson</TableHead>
                <TableHead>Points to Emphasize / label</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const r = resolved[i]
                const story = r.storyNumber != null ? storyTitles.get(r.storyNumber) : null
                return (
                  <TableRow key={i}>
                    <TableCell className="align-top text-sm whitespace-pre">
                      {row.date ? lessonRowDateLabel(row.date) : '—'}
                    </TableCell>
                    <TableCell className="align-top">
                      <Select
                        value={row.kind}
                        onValueChange={(v) => update(i, {kind: v as LessonKind, ...(v === 'note' ? {date: null} : {})})}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(KIND_LABELS) as LessonKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="align-top">
                      {row.kind === 'special' ? (
                        <Input
                          value={row.specialLesson}
                          onChange={(e) => update(i, {specialLesson: e.target.value})}
                          placeholder="151-153"
                          className="h-8 w-24"
                        />
                      ) : (
                        <span className="font-mono text-sm">{r.lessonLabel || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        value={row.text}
                        onChange={(e) => update(i, {text: e.target.value})}
                        className="h-8"
                        placeholder={
                          row.kind === 'combined'
                            ? 'Combined service in the auditorium (Missions Sunday)'
                            : row.kind === 'note'
                              ? '(We return to our regular sequence of lessons.)'
                              : 'God speaks to us in the Bible. (Psalm 119:24)'
                        }
                      />
                      {story ? (
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                          <span>
                            #{r.storyNumber} — {story}
                          </span>
                          {!row.text && storyPoints.get(r.storyNumber!) ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => update(i, {text: storyPoints.get(r.storyNumber!) ?? ''})}
                            >
                              use last points
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Add a note line below"
                          onClick={() => insertAfter(i, {kind: 'note', date: null, specialLesson: '', text: ''})}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(rows, startNum)} disabled={saving}>
        Save lessons
      </Button>
    </div>
  )
}
