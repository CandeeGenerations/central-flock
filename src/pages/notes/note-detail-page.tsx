import {ConfirmDialog} from '@/components/confirm-dialog'
import {NotesBreadcrumbs} from '@/components/notes/breadcrumbs'
import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {printNote} from '@/lib/note-to-html'
import {deleteNoteItems, fetchNote, fetchNotesBreadcrumb} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Pencil, Printer, Trash2} from 'lucide-react'
import {Suspense, lazy, useEffect, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const NotePreview = lazy(() => import('@/components/notes/note-preview').then((m) => ({default: m.NotePreview})))

export function NoteDetailPage() {
  const {noteId} = useParams<{noteId: string}>()
  const id = Number(noteId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {data: note, isLoading: noteLoading} = useQuery({
    queryKey: queryKeys.note(id),
    queryFn: () => fetchNote(id),
    enabled: !!id,
  })

  const {data: crumbs = []} = useQuery({
    queryKey: queryKeys.notesBreadcrumb(id),
    queryFn: () => fetchNotesBreadcrumb(id),
    enabled: !!id,
  })

  // ⌘E → jump straight to edit
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'e') {
        e.preventDefault()
        navigate(`/notes/note/${id}/edit`)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [id, navigate])

  const deleteMutation = useMutation({
    mutationFn: () => deleteNoteItems([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      queryClient.removeQueries({queryKey: queryKeys.note(id)})
      toast.success('Note deleted')
      navigate('/notes')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete note'),
  })

  if (noteLoading) {
    return (
      <div className="p-4 md:p-6">
        <PageSpinner />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">Note not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/notes')}>
          Back to Notes
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      {/* Breadcrumbs */}
      <NotesBreadcrumbs crumbs={crumbs.slice(0, -1)} lastIsText={false} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold leading-tight">{note.title}</h1>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => navigate(`/notes/note/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Print / Save as PDF"
            onClick={() => printNote(note.title, note.contentJson)}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content — BlockNote read-only view; key ensures re-mount when navigating between notes */}
      <div className="rounded-md border bg-card min-h-48">
        {note.contentJson ? (
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
            <NotePreview key={id} contentJson={note.contentJson} />
          </Suspense>
        ) : (
          <p className="p-4 text-muted-foreground text-sm italic">This note is empty. Click Edit to add content.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this note?"
        description="This will permanently delete the note and all its content. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
