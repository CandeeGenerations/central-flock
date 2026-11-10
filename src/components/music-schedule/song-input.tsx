import {type HymnOption, musicScheduleKeys, searchMusicHymns} from '@/lib/music-schedule-api'
import {hymnRef, parseSongEntry, toTitleCase} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import type {SongValue} from '@/pages/music-schedule/song-picker'
import {useQuery} from '@tanstack/react-query'
import {useRef, useState} from 'react'

/** 'b219' for the current song — what the field shows once you start editing it. */
function entryFor(value: SongValue): string {
  if (value.hymnBook && value.hymnNumber != null) return `${value.hymnBook === 'silver' ? 's' : 'b'}${value.hymnNumber}`
  return ''
}

function displayFor(value: SongValue): string {
  const ref = hymnRef(value.hymnBook, value.hymnNumber)
  const title =
    value.text.trim() || value.freeSongTitle?.trim() || (value.hymnTitle ? toTitleCase(value.hymnTitle) : '')
  return [ref, title].filter(Boolean).join('  ')
}

/**
 * A song typed the way the paper writes it: `219` / `b219` / `B#219` is
 * Burgundy, `s27` Silver, words search titles. Enter commits and moves to the
 * next song, Shift+Enter to the previous, Tab to the suffix, Esc puts it back.
 */
export function SongInput({
  value,
  onCommit,
  onNext,
  onPrev,
  onSuffix,
  autoFocus,
  className,
  'data-song-input': dataSongInput,
}: {
  value: SongValue
  onCommit: (next: Partial<SongValue>) => void
  onNext?: () => void
  onPrev?: () => void
  onSuffix?: () => void
  autoFocus?: boolean
  className?: string
  'data-song-input'?: string
}) {
  // null = not editing: the field shows the song as it reads.
  const [draft, setDraft] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const skipBlurCommit = useRef(false)

  const entry = parseSongEntry(draft ?? '')
  const q = entry.kind === 'number' ? String(entry.number) : entry.kind === 'search' ? entry.q : ''
  const {data, isFetching} = useQuery({
    queryKey: musicScheduleKeys.hymns(q),
    queryFn: () => searchMusicHymns(q),
    enabled: draft !== null && (entry.kind === 'number' || (entry.kind === 'search' && q.length > 1)),
    staleTime: 5 * 60_000,
  })

  const numberMatch =
    entry.kind === 'number' ? data?.find((h) => h.book === entry.book && h.number === entry.number) : undefined
  const results = entry.kind === 'search' ? (data ?? []).slice(0, 8) : []

  const pick = (h: HymnOption) =>
    onCommit({hymnId: h.id, hymnBook: h.book, hymnNumber: h.number, hymnTitle: h.title, freeSongTitle: null, text: ''})

  /** Commit what is typed if it resolves. Returns false when it can't be (unknown number, no pick). */
  const commit = (): boolean => {
    if (draft === null) return true
    if (draft === entryFor(value)) return true
    if (entry.kind === 'empty') {
      onCommit({hymnId: null, hymnBook: null, hymnNumber: null, hymnTitle: null, freeSongTitle: null, text: ''})
      return true
    }
    if (entry.kind === 'number' && numberMatch) {
      pick(numberMatch)
      return true
    }
    if (entry.kind === 'search' && results[active]) {
      pick(results[active])
      return true
    }
    return false
  }

  const finish = (then?: () => void) => {
    if (!commit()) return
    setDraft(null)
    if (then) {
      // Moving focus blurs this field before the re-render; don't commit twice.
      skipBlurCommit.current = true
      then()
    }
  }

  const hint =
    draft === null
      ? null
      : entry.kind === 'number'
        ? numberMatch
          ? toTitleCase(numberMatch.title)
          : isFetching
            ? '…'
            : `no ${entry.book === 'silver' ? 'S' : 'B'} #${entry.number}`
        : null

  return (
    <div className={cn('relative flex min-w-0 flex-1 items-center gap-2', className)}>
      <input
        data-song-input={dataSongInput}
        autoFocus={autoFocus}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Song # or title…"
        aria-label="Song"
        className={cn(
          'h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none',
          'hover:border-input focus:border-ring focus:bg-background focus:ring-ring/30 focus:ring-2',
          'pointer-coarse:h-10',
          draft === null ? 'flex-1 truncate font-medium' : 'w-28 shrink-0',
        )}
        value={draft ?? displayFor(value)}
        onFocus={(e) => {
          if (draft === null) {
            setDraft(entryFor(value))
            setActive(0)
            requestAnimationFrame(() => e.target.select())
          }
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          setActive(0)
        }}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false
            return
          }
          commit()
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && results.length) {
            e.preventDefault()
            setActive((i) => Math.min(results.length - 1, i + 1))
          } else if (e.key === 'ArrowUp' && results.length) {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            finish(e.shiftKey ? onPrev : onNext)
          } else if (e.key === 'Tab' && !e.shiftKey && onSuffix) {
            e.preventDefault()
            finish(onSuffix)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            skipBlurCommit.current = true
            setDraft(null)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {hint ? (
        <span className={cn('truncate text-sm', numberMatch ? 'text-foreground' : 'text-muted-foreground italic')}>
          {hint}
        </span>
      ) : null}
      {results.length ? (
        <div
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 max-h-64 w-80 overflow-y-auto rounded-md border text-sm shadow-md"
        >
          {results.map((h, i) => (
            <button
              key={h.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn('block w-full px-2 py-1.5 text-left pointer-coarse:py-2.5', i === active && 'bg-muted')}
              // mousedown, so the pick lands before the input's blur.
              onMouseDown={(e) => {
                e.preventDefault()
                setActive(i)
                pick(h)
                skipBlurCommit.current = true
                setDraft(null)
                onNext?.()
              }}
            >
              <span className="font-medium">{hymnRef(h.book, h.number)}</span> {toTitleCase(h.title)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
