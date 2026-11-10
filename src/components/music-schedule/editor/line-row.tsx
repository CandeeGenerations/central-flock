import {SongInput} from '@/components/music-schedule/song-input'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {type MusicLineRole, ROLE_DEFAULTS, ROLE_LABELS} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {ChevronDown, GripVertical, Highlighter, Trash2} from 'lucide-react'
import {type ReactNode, useState} from 'react'

import {type Draft, type LineChange, songValueOf} from './draft'

const ROLES = Object.keys(ROLE_LABELS) as MusicLineRole[]

// Borderless until hovered or focused, so a row reads as the line it prints.
const QUIET_INPUT =
  'h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 pointer-coarse:h-10'

const FIELD_INPUT =
  'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 pointer-coarse:h-10'

/**
 * One line of the Service Order. Closed, it shows only what prints — the song
 * or the text, the suffix, a quiet role tag — with its actions on hover (mouse)
 * or once selected (touch). Open, it shows the rarer settings as labelled rows.
 */
export function LineRow({
  line,
  selected,
  onSelect,
  onChange,
  onDelete,
  onNextSong,
  onPrevSong,
}: {
  line: Draft
  selected: boolean
  onSelect: (selected: boolean) => void
  onChange: LineChange
  onDelete: () => void
  onNextSong: () => void
  onPrevSong: () => void
}) {
  const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
    id: line.key,
  })
  const style = {transform: CSS.Transform.toString(transform), transition}

  const grip = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label="Drag to reorder"
      className="text-muted-foreground hover:text-foreground flex h-8 w-6 shrink-0 cursor-grab touch-manipulation items-center justify-center active:cursor-grabbing pointer-coarse:h-10 pointer-coarse:w-9"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  const actionsClass = cn(
    'flex shrink-0 items-center gap-0.5',
    selected
      ? 'opacity-100'
      : 'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-coarse:hidden',
  )

  if (line.kind === 'page_break')
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group bg-background flex items-center gap-1 rounded border border-dashed px-1',
          isDragging && 'z-10 shadow-lg',
        )}
        onClick={(e) => e.target === e.currentTarget && onSelect(!selected)}
      >
        {grip}
        <span className="text-muted-foreground flex-1 text-center text-xs">── page break ──</span>
        <div className={actionsClass}>
          <IconButton label="Delete this page break" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    )

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-line-key={line.key}
      className={cn(
        'group bg-background rounded border',
        selected && 'ring-ring/40 ring-2',
        line.highlight && 'bg-yellow-50 dark:bg-yellow-950/30',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      {/* Tapping the row's empty space selects it; the inputs keep their own taps. */}
      <div
        className="flex items-center gap-1 px-1 py-0.5"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('input,button,[role=listbox]')) onSelect(!selected)
        }}
      >
        {grip}
        {line.kind === 'song' ? (
          <>
            <SongInput
              data-song-input={line.key}
              value={songValueOf(line)}
              onCommit={(patch) => onChange(patch, {immediate: true})}
              onNext={onNextSong}
              onPrev={onPrevSong}
              onSuffix={() => document.querySelector<HTMLInputElement>(`[data-suffix-input="${line.key}"]`)?.focus()}
            />
            <input
              data-suffix-input={line.key}
              aria-label="Suffix"
              className={cn(QUIET_INPUT, 'text-muted-foreground w-24 shrink-0')}
              placeholder={selected ? '(x2)' : ''}
              value={line.suffix}
              onChange={(e) => onChange({suffix: e.target.value})}
            />
          </>
        ) : (
          <input
            aria-label="Line text"
            className={cn(QUIET_INPUT, 'flex-1')}
            placeholder="text"
            value={line.text}
            onChange={(e) => onChange({text: e.target.value})}
          />
        )}
        <span className="text-muted-foreground hidden w-24 shrink-0 truncate text-right text-[11px] sm:inline">
          {ROLE_LABELS[line.role]}
        </span>
        <div className={actionsClass}>
          <IconButton
            label={line.highlight ? 'Remove the Musicians highlight' : 'Highlight on the Musicians sheet'}
            active={line.highlight}
            onClick={() => onChange({highlight: !line.highlight}, {immediate: true})}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label={selected ? 'Close this line' : 'Open this line'} onClick={() => onSelect(!selected)}>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', selected && 'rotate-180')} />
          </IconButton>
          <IconButton label="Delete this line" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {selected ? <LineDetails line={line} onChange={onChange} /> : null}
    </div>
  )
}

function LineDetails({line, onChange}: {line: Draft; onChange: LineChange}) {
  const [more, setMore] = useState(line.merged !== null)
  const d = ROLE_DEFAULTS[line.role]
  return (
    <div className="space-y-2 border-t px-3 py-3 text-sm">
      <Row label="Role">
        <Select value={line.role} onValueChange={(v) => onChange({role: v as MusicLineRole}, {immediate: true})}>
          <SelectTrigger size="sm" className="w-48 pointer-coarse:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {line.kind === 'song' ? (
        <Row label="Next week">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={line.sticky}
              onCheckedChange={(v) => onChange({sticky: v === true}, {immediate: true})}
            />
            Keep this song when the next week is created
          </label>
        </Row>
      ) : null}
      <Row label="Highlight">
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={line.highlight ? 'default' : 'outline'}
            className="pointer-coarse:h-10"
            onClick={() => onChange({highlight: !line.highlight}, {immediate: true})}
          >
            Musicians
          </Button>
          <Button
            type="button"
            size="sm"
            variant={line.boothHighlight ? 'default' : 'outline'}
            className="pointer-coarse:h-10"
            onClick={() => onChange({boothHighlight: !line.boothHighlight}, {immediate: true})}
          >
            Sound Booth
          </Button>
        </div>
      </Row>
      <Row label="Booth note">
        <input
          className={FIELD_INPUT}
          placeholder={d.boothNote || '(Choir & Cong.) — blank prints nothing'}
          value={line.boothNote}
          onChange={(e) => onChange({boothNote: e.target.value})}
        />
      </Row>
      <Row label="Left cell">
        <input
          className={FIELD_INPUT}
          placeholder={d.leftLabel === null ? 'the song number (automatic)' : d.leftLabel || 'empty (automatic)'}
          value={line.leftText}
          onChange={(e) => onChange({leftText: e.target.value})}
        />
      </Row>
      {more ? (
        <>
          <Row label="Layout">
            <Select
              value={line.merged === null ? 'auto' : line.merged ? 'merged' : 'split'}
              onValueChange={(v) => onChange({merged: v === 'auto' ? null : v === 'merged'}, {immediate: true})}
            >
              <SelectTrigger size="sm" className="w-48 pointer-coarse:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic ({d.merged ? 'full width' : 'two cells'})</SelectItem>
                <SelectItem value="split">Two cells</SelectItem>
                <SelectItem value="merged">Full width</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {line.kind === 'song' ? (
            <>
              <Row label="Printed as">
                <input
                  className={FIELD_INPUT}
                  placeholder="the hymnal's title"
                  value={line.text}
                  onChange={(e) => onChange({text: e.target.value})}
                />
              </Row>
              <Row label="Not in a book">
                <input
                  className={FIELD_INPUT}
                  placeholder="a song in neither hymnal — type its title"
                  value={line.freeSongTitle ?? ''}
                  onChange={(e) =>
                    onChange(
                      e.target.value
                        ? {
                            freeSongTitle: e.target.value,
                            hymnId: null,
                            hymnBook: null,
                            hymnNumber: null,
                            hymnTitle: null,
                          }
                        : {freeSongTitle: null},
                    )
                  }
                />
              </Row>
            </>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="text-muted-foreground pl-24 text-xs underline underline-offset-2"
          onClick={() => setMore(true)}
        >
          More
        </button>
      )}
    </div>
  )
}

function Row({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-22 shrink-0 text-xs">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? 'default' : 'ghost'}
      aria-label={label}
      title={label}
      className="h-7 w-7 pointer-coarse:h-10 pointer-coarse:w-10"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
