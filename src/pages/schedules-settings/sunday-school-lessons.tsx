import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Textarea} from '@/components/ui/textarea'
import {
  type BettyLukensStory,
  fetchBettyLukensStories,
  saveBettyLukensStory,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {MAX_LESSON_NUMBER} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useMemo, useState} from 'react'
import {toast} from 'sonner'

// The Betty Lukens catalogue. The number is what a Lesson Row prints; the title
// only labels the picker and seeds Points to Emphasize, so a title typo is
// cosmetic while a number mismatch is not.
export function SundaySchoolLessonsPane() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<BettyLukensStory | null>(null)
  const [draft, setDraft] = useState({title: '', page: '', lastPoints: ''})

  const {data: stories, isLoading} = useQuery({queryKey: workersNotesKeys.stories, queryFn: fetchBettyLukensStories})

  const save = useMutation({
    mutationFn: ({number, ...body}: {number: number; title: string; page: number | null; lastPoints: string | null}) =>
      saveBettyLukensStory(number, body),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.stories})
      setEditing(null)
      toast.success('Story updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stories ?? []
    return (stories ?? []).filter(
      (s) =>
        s.title.toLowerCase().includes(q) || String(s.number) === q || (s.lastPoints ?? '').toLowerCase().includes(q),
    )
  }, [stories, query])

  if (isLoading) return <PageSpinner />

  function openEditor(s: BettyLukensStory) {
    setEditing(s)
    setDraft({title: s.title, page: s.page == null ? '' : String(s.page), lastPoints: s.lastPoints ?? ''})
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Betty Lukens Lessons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {stories?.length ?? 0} of {MAX_LESSON_NUMBER} stories from the book&apos;s table of contents. The number is
            what prints on page 2; the title only labels the lesson picker. Page numbers are the least certain field —
            they never print, so correct them only if you care.
          </p>

          <Input
            placeholder="Search by title, number, or points…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-20">Page</TableHead>
                  <TableHead>Last points written</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.number} className="hover:bg-muted/50 cursor-pointer" onClick={() => openEditor(s)}>
                    <TableCell className="font-mono">{s.number}</TableCell>
                    <TableCell>{s.title}</TableCell>
                    <TableCell className="text-muted-foreground">{s.page ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{s.lastPoints ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lesson {editing?.number}</DialogTitle>
            <DialogDescription>
              The number is what prints on page 2. The title labels the lesson picker and never prints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft((d) => ({...d, title: e.target.value}))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Page in book</Label>
              <Input
                value={draft.page}
                onChange={(e) => setDraft((d) => ({...d, page: e.target.value}))}
                className="w-24"
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Last points written</Label>
              <p className="text-muted-foreground text-xs">
                What a new lesson row prefills with when it lands on this story. Saving an edition&apos;s lesson table
                overwrites this with whatever you wrote there.
              </p>
              <Textarea
                rows={3}
                value={draft.lastPoints}
                onChange={(e) => setDraft((d) => ({...d, lastPoints: e.target.value}))}
                placeholder="God speaks to us in the Bible. (Psalm 119:24)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                editing &&
                save.mutate({
                  number: editing.number,
                  title: draft.title,
                  page: draft.page.trim() === '' ? null : Number(draft.page),
                  lastPoints: draft.lastPoints.trim() === '' ? null : draft.lastPoints,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
