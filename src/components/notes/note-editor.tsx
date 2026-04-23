import {useTheme} from '@/lib/theme-context'
import {PartialBlock} from '@blocknote/core'
import {useCreateBlockNote} from '@blocknote/react'
import {BlockNoteView} from '@blocknote/shadcn'
import '@blocknote/shadcn/style.css'
import {useCallback} from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse stored contentJson into BlockNote PartialBlock[].
 *  Falls back to plain-text migration (one paragraph per line) for notes
 *  that were created before BlockNote was introduced. */
function parseBlocks(contentJson: string | null | undefined): PartialBlock[] | undefined {
  if (!contentJson) return undefined
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as PartialBlock[]
  } catch {
    // Not JSON — treat as legacy plain text
  }
  // Plain-text migration: split by newline, each line → paragraph block
  return contentJson.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content: line ? [{type: 'text' as const, text: line, styles: {}}] : [],
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NoteEditorProps {
  noteId: number
  contentJson: string | null
  onContentChange: (json: string) => void
}

/**
 * Full BlockNote editor for a note.
 *
 * Intended to be lazy-loaded by the parent page so the heavy BlockNote bundle
 * is only fetched when a note is actually opened for editing.
 *
 * The parent must pass `key={noteId}` so React remounts this component
 * (and therefore re-creates the editor) when navigating between notes.
 */
export function NoteEditor({noteId, contentJson, onContentChange}: NoteEditorProps) {
  const {isDark} = useTheme()

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/notes/${noteId}/attachments`, {method: 'POST', body: form})
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {error?: string}
        throw new Error(body.error ?? 'Upload failed')
      }
      const data = (await res.json()) as {id: number; url: string}
      return data.url
    },
    [noteId],
  )

  const editor = useCreateBlockNote({
    initialContent: parseBlocks(contentJson),
    uploadFile,
  })

  return (
    <BlockNoteView
      editor={editor}
      theme={isDark ? 'dark' : 'light'}
      onChange={() => onContentChange(JSON.stringify(editor.document))}
      className="min-h-[60vh] rounded-md border"
    />
  )
}
