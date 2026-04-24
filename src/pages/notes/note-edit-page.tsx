import {ConfirmDialog} from '@/components/confirm-dialog'
import {NotesBreadcrumbs} from '@/components/notes/breadcrumbs'
import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {formatDateTime} from '@/lib/date'
import {printNote} from '@/lib/note-to-html'
import {deleteNoteItems, fetchNote, fetchNotesBreadcrumb, updateNoteItem} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Printer, Trash2} from 'lucide-react'
import {Suspense, lazy, useCallback, useEffect, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const NoteEditor = lazy(() => import('@/components/notes/note-editor').then((m) => ({default: m.NoteEditor})))

type SaveStatus = 'idle' | 'saving' | 'saved'

export function NoteEditPage() {
  const {noteId} = useParams<{noteId: string}>()
  const id = Number(noteId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const flushRef = useRef<(() => void) | null>(null)
  const lastSavedRef = useRef<{title: string; content: string} | null>(null)

  const {data: note, isLoading} = useQuery({
    queryKey: queryKeys.note(id),
    queryFn: () => fetchNote(id),
    enabled: !!id,
  })

  const {data: crumbs = []} = useQuery({
    queryKey: queryKeys.notesBreadcrumb(id),
    queryFn: () => fetchNotesBreadcrumb(id),
    enabled: !!id,
  })

  useEffect(() => {
    if (note) {
      const seededTitle = note.title
      const seededContent = note.contentJson ?? ''
      setTitle(seededTitle)
      setContent(seededContent)
      lastSavedRef.current = {title: seededTitle, content: seededContent}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  const saveMutation = useMutation({
    mutationFn: (data: {title: string; contentJson: string}) =>
      updateNoteItem(id, {title: data.title, contentJson: data.contentJson || null}),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: (_res, data) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      queryClient.invalidateQueries({queryKey: queryKeys.note(id)})
      lastSavedRef.current = {title: data.title, content: data.contentJson ?? ''}
      setSaveStatus('saved')
    },
    onError: (e) => {
      setSaveStatus('idle')
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    },
  })

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

  const debouncedTitle = useDebouncedValue(title, 1500)
  const debouncedContent = useDebouncedValue(content, 1500)

  const save = useCallback(
    (t: string, c: string) => {
      const last = lastSavedRef.current
      if (!last) return
      if (last.title === t && last.content === c) return
      saveMutation.mutate({title: t, contentJson: c})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  useEffect(() => {
    flushRef.current = () => save(title, content)
  }, [title, content, save])

  useEffect(() => {
    if (!note) return
    save(debouncedTitle, debouncedContent)
  }, [debouncedTitle, debouncedContent]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      flushRef.current?.()
    }
  }, [])

  if (isLoading) {
    return (
      <div className="p-6">
        <PageSpinner />
      </div>
    )
  }

  if (!note) {
    return <div className="p-6 text-sm text-muted-foreground">Note not found.</div>
  }

  const parentCrumbs = crumbs.slice(0, -1)

  return (
    <div className="max-w-3xl mx-auto px-8 pt-8 pb-16">
      {/* Top bar: breadcrumbs + actions */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <NotesBreadcrumbs crumbs={parentCrumbs} lastIsText={false} />
        <div className="flex items-center gap-1">
          {saveStatus === 'saving' && <span className="text-xs text-muted-foreground/60 mr-2">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-muted-foreground/60 mr-2">Saved</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => printNote(note.title, note.contentJson)}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Title */}
      <input
        className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 leading-tight tracking-tight mb-1"
        placeholder="Untitled"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setSaveStatus('idle')
        }}
      />

      {/* Timestamps */}
      <p className="text-xs text-muted-foreground/40 mb-4">
        {formatDateTime(note.createdAt)}
        {note.updatedAt !== note.createdAt && <> · edited {formatDateTime(note.updatedAt)}</>}
      </p>

      {/* Editor */}
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        }
      >
        <NoteEditor
          key={id}
          noteId={id}
          contentJson={note.contentJson}
          onContentChange={(json) => {
            setContent(json)
            setSaveStatus('idle')
          }}
        />
      </Suspense>

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
