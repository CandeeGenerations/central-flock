import {SongInput} from '@/components/music-schedule/song-input'
import {Input} from '@/components/ui/input'
import {useAutosave} from '@/hooks/use-autosave'
import {type LineInput, type MusicService, saveMusicLines} from '@/lib/music-schedule-api'
import {type OrderLine, ROLE_LABELS} from '@/lib/music-schedule-core'
import type {SongValue} from '@/pages/music-schedule/song-picker'
import {useEffect, useRef, useState} from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function toInput(l: OrderLine): LineInput {
  return {
    kind: l.kind,
    role: l.role,
    hymnId: l.hymnId,
    freeSongTitle: l.freeSongTitle,
    suffix: l.suffix,
    leftText: l.leftText,
    text: l.text,
    merged: l.merged,
    align: l.align,
    bold: l.bold,
    italic: l.italic,
    highlight: l.highlight,
    boothHighlight: l.boothHighlight,
    sticky: l.sticky,
    booth: l.booth,
    boothLabel: l.boothLabel,
    boothNote: l.boothNote,
  }
}

/** Move focus to the song input `step` places away, across every service on the page. */
function focusSong(from: HTMLElement | null, step: number) {
  const all = [...document.querySelectorAll<HTMLInputElement>('[data-week-song] input')]
  const at = all.findIndex((el) => from?.contains(el))
  all[at + step]?.focus()
  all[at + step]?.select()
}

/**
 * Every song slot of the week in one list, for filling the week in from the
 * pastor's sheets with the keyboard: type a number, Enter, next song — across
 * service boundaries. Each service saves on its own as songs are committed.
 */
export function WeekSongsPanel({
  weekId,
  services,
  onSaved,
}: {
  weekId: number
  services: MusicService[]
  onSaved: () => void
}) {
  const [statuses, setStatuses] = useState<Record<number, SaveStatus>>({})
  const values = Object.values(statuses)
  const overall: SaveStatus = values.includes('error')
    ? 'error'
    : values.includes('saving')
      ? 'saving'
      : values.includes('saved')
        ? 'saved'
        : 'idle'

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Type <code>219</code> (Burgundy) or <code>s27</code> (Silver), then Enter for the next song.{' '}
        <span className={overall === 'error' ? 'font-medium text-red-600' : ''}>
          {overall === 'saving'
            ? 'Saving…'
            : overall === 'saved'
              ? 'Saved'
              : overall === 'error'
                ? 'Not saved — check your connection'
                : ''}
        </span>
      </p>
      {services
        .filter((s) => s.meeting)
        .map((s) => (
          <ServiceSongs
            key={s.id}
            weekId={weekId}
            service={s}
            onSaved={onSaved}
            onStatus={(st) => setStatuses((prev) => (prev[s.id] === st ? prev : {...prev, [s.id]: st}))}
          />
        ))}
    </div>
  )
}

function ServiceSongs({
  weekId,
  service,
  onSaved,
  onStatus,
}: {
  weekId: number
  service: MusicService
  onSaved: () => void
  onStatus: (s: SaveStatus) => void
}) {
  // Local copy, seeded once: a refetch after a save must not clobber a song being typed.
  const [lines, setLines] = useState<OrderLine[]>(service.lines)
  const autosave = useAutosave<OrderLine[]>({
    save: async (next) => {
      await saveMusicLines(weekId, service.id, next.map(toInput))
      onSaved()
    },
  })
  const statusRef = useRef(onStatus)
  useEffect(() => {
    statusRef.current = onStatus
  })
  useEffect(() => statusRef.current(autosave.status), [autosave.status])

  const songs = lines.map((l, i) => ({l, i})).filter(({l}) => l.kind === 'song')
  if (!songs.length) return null

  const change = (i: number, patch: Partial<OrderLine>, immediate: boolean) => {
    const next = lines.map((l, j) => (j === i ? {...l, ...patch} : l))
    setLines(next)
    autosave.schedule(next, {immediate})
  }

  return (
    <section>
      <h4 className="mb-1 text-sm font-semibold">
        {service.name}
        {service.occasion ? (
          <span className="text-muted-foreground ml-2 font-normal italic">{service.occasion}</span>
        ) : null}
      </h4>
      <div className="divide-y rounded border">
        {songs.map(({l, i}) => (
          <div key={l.id ?? i} data-week-song className="flex items-center gap-2 p-1.5">
            <span className="text-muted-foreground w-28 shrink-0 truncate text-xs">{ROLE_LABELS[l.role]}</span>
            <SongInput
              className="min-w-0 flex-1"
              value={songValue(l)}
              onCommit={(next) => change(i, next, true)}
              onNext={() => focusSong(document.activeElement as HTMLElement, 1)}
              onPrev={() => focusSong(document.activeElement as HTMLElement, -1)}
            />
            <Input
              className="h-8 w-28 shrink-0 text-xs pointer-coarse:h-10"
              placeholder="(x2)"
              defaultValue={l.suffix}
              onChange={(e) => change(i, {suffix: e.target.value}, false)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function songValue(l: OrderLine): SongValue {
  return {
    hymnId: l.hymnId,
    hymnBook: l.hymnBook,
    hymnNumber: l.hymnNumber,
    hymnTitle: l.hymnTitle,
    freeSongTitle: l.freeSongTitle,
    text: l.text,
  }
}
