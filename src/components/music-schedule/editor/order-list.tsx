import {Button} from '@/components/ui/button'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {type MusicLineKind, guessRole, neighbourSongIndex} from '@/lib/music-schedule-core'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy} from '@dnd-kit/sortable'
import {Plus} from 'lucide-react'

import {type Draft, type LineChange, emptyLine} from './draft'
import {LineRow} from './line-row'

const focusSong = (key: string) => document.querySelector<HTMLInputElement>(`[data-song-input="${key}"]`)?.focus()

/**
 * The Service Order as a list you drag to reorder. Mouse drags after a few
 * pixels; a finger has to press and hold the grip, so scrolling the list never
 * picks a row up; the keyboard lifts with Space and moves with the arrows.
 */
export function OrderList({
  lines,
  selectedKey,
  onSelect,
  onLines,
  onChangeLine,
  onDeleteLine,
}: {
  lines: Draft[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
  /** A structural change — drag or insert. Saves at once. */
  onLines: (lines: Draft[]) => void
  onChangeLine: (key: string, ...args: Parameters<LineChange>) => void
  onDeleteLine: (key: string) => void
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {activationConstraint: {distance: 4}}),
    useSensor(TouchSensor, {activationConstraint: {delay: 200, tolerance: 6}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  )

  const onDragEnd = ({active, over}: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = lines.findIndex((l) => l.key === active.id)
    const to = lines.findIndex((l) => l.key === over.id)
    onLines(arrayMove(lines, from, to))
  }

  const add = (kind: MusicLineKind) => {
    const at = selectedKey ? lines.findIndex((l) => l.key === selectedKey) + 1 : lines.length
    const line = emptyLine(kind, guessRole(kind, lines.slice(0, at)))
    onLines([...lines.slice(0, at), line, ...lines.slice(at)])
    onSelect(kind === 'page_break' ? null : line.key)
    if (kind === 'song') requestAnimationFrame(() => focusSong(line.key))
  }

  const moveToSong = (from: number, dir: 1 | -1) => {
    const i = neighbourSongIndex(lines, from, dir)
    if (i >= 0) focusSong(lines[i].key)
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={lines.map((l) => l.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {lines.map((line, i) => (
              <LineRow
                key={line.key}
                line={line}
                selected={selectedKey === line.key}
                onSelect={(sel) => onSelect(sel ? line.key : null)}
                onChange={(patch, opts) => onChangeLine(line.key, patch, opts)}
                onDelete={() => onDeleteLine(line.key)}
                onNextSong={() => moveToSong(i, 1)}
                onPrevSong={() => moveToSong(i, -1)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="pointer-coarse:h-10">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => add('song')}>Song</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => add('prose')}>Line</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => add('page_break')}>Page break</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedKey ? <span className="text-muted-foreground ml-2 text-xs">adds after the selected line</span> : null}
    </div>
  )
}
