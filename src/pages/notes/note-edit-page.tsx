import {NotesBreadcrumbs} from '@/components/notes/breadcrumbs'
import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {fetchNote, fetchNotesBreadcrumb, updateNoteItem} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft} from 'lucide-react'
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
  const flushRef = useRef<(() => void) | null>(null)

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

  // Seed local state from server when the note id changes (navigating between notes).
  // Intentionally omit `note` from deps — we only want to re-seed on id change, not on every save.
  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.contentJson ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: {title: string; contentJson: string}) =>
      updateNoteItem(id, {title: data.title, contentJson: data.contentJson || null}),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      queryClient.invalidateQueries({queryKey: queryKeys.note(id)})
      setSaveStatus('saved')
    },
    onError: (e) => {
      setSaveStatus('idle')
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    },
  })

  // Debounced autosave
  const debouncedTitle = useDebouncedValue(title, 1500)
  const debouncedContent = useDebouncedValue(content, 1500)

  const save = useCallback(
    (t: string, c: string) => {
      saveMutation.mutate({title: t, contentJson: c})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  // Register flush for unmount
  useEffect(() => {
    flushRef.current = () => save(title, content)
  }, [title, content, save])

  useEffect(() => {
    if (!note) return // don't save before data loads
    save(debouncedTitle, debouncedContent)
  }, [debouncedTitle, debouncedContent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushRef.current?.()
    }
  }, [])

  const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''

  if (isLoading) {
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
    <div className="p-4 md:p-6 space-y-3 max-w-3xl">
      {/* Nav row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(`/notes/note/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <NotesBreadcrumbs crumbs={crumbs.slice(0, -1)} lastIsText={false} />
        </div>
        {saveLabel && <span className="text-xs text-muted-foreground shrink-0">{saveLabel}</span>}
      </div>

      {/* Title input — Notion-style large separate field */}
      <input
        className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 leading-tight"
        placeholder="Untitled"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setSaveStatus('idle')
        }}
      />

      {/* BlockNote editor — lazy-loaded; key ensures re-mount when navigating between notes */}
      <Suspense
        fallback={
          <div className="min-h-[60vh] rounded-md border flex items-center justify-center text-sm text-muted-foreground">
            Loading editor…
          </div>
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
    </div>
  )
}
