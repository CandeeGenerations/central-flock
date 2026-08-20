import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {PageSpinner} from '@/components/ui/spinner'
import {
  type BettyLukensStory,
  fetchBettyLukensStories,
  saveBettyLukensStory,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {MAX_LESSON_NUMBER} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Check, Pencil, X} from 'lucide-react'
import {useMemo, useState} from 'react'
import {toast} from 'sonner'

// The Betty Lukens catalogue. The number is what a Lesson Row prints; the title
// only labels the picker and seeds Points to Emphasize, so a title typo is
// cosmetic while a number mismatch is not.
export function SundaySchoolLessonsPane() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<{title: string; page: string}>({title: '', page: ''})

  const {data: stories, isLoading} = useQuery({queryKey: workersNotesKeys.stories, queryFn: fetchBettyLukensStories})

  const save = useMutation({
    mutationFn: ({number, title, page}: {number: number; title: string; page: number | null}) =>
      saveBettyLukensStory(number, {title, page}),
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
    return (stories ?? []).filter((s) => s.title.toLowerCase().includes(q) || String(s.number) === q)
  }, [stories, query])

  if (isLoading) return <PageSpinner />

  function beginEdit(s: BettyLukensStory) {
    setEditing(s.number)
    setDraft({title: s.title, page: s.page == null ? '' : String(s.page)})
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-sm">
          {stories?.length ?? 0} of {MAX_LESSON_NUMBER} stories from the book&apos;s table of contents. The number is
          what prints on page 2; the title only labels the lesson picker. Page numbers are the least certain field —
          they never print, so correct them only if you care.
        </p>
      </div>

      <Input
        placeholder="Search by title or number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-16 px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Page</th>
              <th className="px-3 py-2 text-left font-medium">Last points written</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.number} className="border-t">
                <td className="px-3 py-1.5 font-mono">{s.number}</td>
                <td className="px-3 py-1.5">
                  {editing === s.number ? (
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({...d, title: e.target.value}))}
                      className="h-8"
                    />
                  ) : (
                    s.title
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {editing === s.number ? (
                    <Input
                      value={draft.page}
                      onChange={(e) => setDraft((d) => ({...d, page: e.target.value}))}
                      className="h-8 w-16"
                    />
                  ) : (
                    (s.page ?? '—')
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-1.5 text-xs">{s.lastPoints ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  {editing === s.number ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate({
                            number: s.number,
                            title: draft.title,
                            page: draft.page.trim() === '' ? null : Number(draft.page),
                          })
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => beginEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
