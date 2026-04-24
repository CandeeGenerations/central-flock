import {ConfirmDialog} from '@/components/confirm-dialog'
import {NotesBreadcrumbs} from '@/components/notes/breadcrumbs'
import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {formatDateTime} from '@/lib/date'
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
      <div className="p-6">
        <PageSpinner />
      </div>
    )
  }

  if (!note) {
    return <div className="p-6 text-sm text-muted-foreground">Note not found.</div>
  }

  // Breadcrumb path excludes the note itself (last crumb) — shows parent folders only
  const parentCrumbs = crumbs.slice(0, -1)

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      {/* Breadcrumb path */}
      {parentCrumbs.length > 0 && <NotesBreadcrumbs crumbs={parentCrumbs} lastIsText={false} />}

      {/* Title + actions */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{note.title}</h1>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate(`/notes/note/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => printNote(note.title, note.contentJson)}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Timestamps */}
      <p className="text-xs text-muted-foreground/60 -mt-2">
        Created {formatDateTime(note.createdAt)}
        {note.updatedAt !== note.createdAt && <> &middot; Edited {formatDateTime(note.updatedAt)}</>}
      </p>

      {/* Content */}
      <div className="rounded-lg border bg-card min-h-48">
        {note.contentJson ? (
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
            <NotePreview key={id} contentJson={note.contentJson} />
          </Suspense>
        ) : (
          <p className="p-4 text-muted-foreground text-sm italic">
            This note is empty.{' '}
            <button
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => navigate(`/notes/note/${id}/edit`)}
            >
              Start writing
            </button>
          </p>
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
