import {useTheme} from '@/lib/theme-context'
import {PartialBlock} from '@blocknote/core'
import {useCreateBlockNote} from '@blocknote/react'
import {BlockNoteView} from '@blocknote/shadcn'
import '@blocknote/shadcn/style.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse stored contentJson into BlockNote PartialBlock[].
 *  Falls back to plain-text migration for legacy plain-text notes. */
function parseBlocks(contentJson: string | null | undefined): PartialBlock[] | undefined {
  if (!contentJson) return undefined
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as PartialBlock[]
  } catch {
    // Not JSON — treat as legacy plain text
  }
  return contentJson.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content: line ? [{type: 'text' as const, text: line, styles: {}}] : [],
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotePreviewProps {
  contentJson: string | null
}

/**
 * Read-only BlockNote view for a note's content.
 *
 * Intended to be lazy-loaded by the parent page. The parent should pass
 * `key={noteId}` so the editor instance is recreated when the note changes.
 */
export function NotePreview({contentJson}: NotePreviewProps) {
  const {isDark} = useTheme()

  const editor = useCreateBlockNote({
    initialContent: parseBlocks(contentJson),
  })

  return <BlockNoteView editor={editor} theme={isDark ? 'dark' : 'light'} editable={false} />
}
