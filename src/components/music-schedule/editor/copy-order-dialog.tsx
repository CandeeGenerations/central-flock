import {MusicServiceBlock} from '@/components/music-schedule/service-block'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {
  type CopySource,
  copyServiceOrder,
  fetchCopySources,
  fetchMusicWeek,
  musicScheduleKeys,
} from '@/lib/music-schedule-api'
import {MONTH_NAMES, dayOfWeek, hymnRef, parseDate, songTitle} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import {useMutation, useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

import type {Draft} from './draft'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateLabel(iso: string) {
  const {y, m, d} = parseDate(iso)
  return `${DAYS[dayOfWeek(iso)]} ${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`
}

function sourceLabel(s: CopySource) {
  return s.occasion || s.musicHeading || s.name || 'Service'
}

/**
 * Replace this service's order with an earlier one's — how a Standalone order
 * (last year's Thanksgiving Eve) is reused on purpose. Standalone services list
 * first, newest first.
 */
export function CopyOrderDialog({
  open,
  onOpenChange,
  weekId,
  serviceId,
  currentLines,
  beforeCopy,
  onCopied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekId: number
  serviceId: number
  currentLines: Draft[]
  /** Settles pending autosaves first, so a late save can't overwrite the copy. */
  beforeCopy: () => Promise<void>
  onCopied: () => void
}) {
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<CopySource | null>(null)

  const {data: sources} = useQuery({
    queryKey: ['music-schedules', 'copy-sources', serviceId],
    queryFn: () => fetchCopySources(serviceId),
    enabled: open,
  })
  const {data: sourceWeek} = useQuery({
    queryKey: musicScheduleKeys.detail(chosen?.weekId ?? -1),
    queryFn: () => fetchMusicWeek(chosen!.weekId),
    enabled: !!chosen,
  })
  const sourceService = sourceWeek?.services.find((s) => s.id === chosen?.id)

  const copy = useMutation({
    mutationFn: async () => {
      await beforeCopy()
      return copyServiceOrder(weekId, serviceId, chosen!.id)
    },
    onSuccess: () => {
      toast.success('Order copied')
      onOpenChange(false)
      setChosen(null)
      onCopied()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to copy the order'),
  })

  const q = search.trim().toLowerCase()
  const filtered = (sources ?? []).filter(
    (s) => !q || [sourceLabel(s), s.name, s.title, dateLabel(s.date)].some((t) => t.toLowerCase().includes(q)),
  )
  const replacedSongs = currentLines.filter((l) => l.kind === 'song' && (l.hymnId || l.freeSongTitle))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Copy order from…</DialogTitle>
          <DialogDescription>
            Replaces this service&rsquo;s lines, songs and headings with another service&rsquo;s. Title, Text, their
            notes, highlights and the Occasion stay as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Input
              placeholder="Search — candlelight, anniversary, a date…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-80 overflow-y-auto rounded border">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    'hover:bg-muted block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 pointer-coarse:py-3',
                    chosen?.id === s.id && 'bg-muted',
                  )}
                  onClick={() => setChosen(s)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sourceLabel(s)}</span>
                    {s.standalone ? (
                      <span className="rounded bg-violet-100 px-1.5 text-[10px] text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                        Standalone
                      </span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {dateLabel(s.date)} · {s.lineCount} lines{s.title ? ` · ${s.title}` : ''}
                  </div>
                </button>
              ))}
              {sources && !filtered.length ? (
                <p className="text-muted-foreground p-3 text-sm">Nothing matches.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded border bg-white p-2 text-black">
            {sourceService ? (
              <div style={{zoom: 0.55}}>
                <MusicServiceBlock service={sourceService} />
              </div>
            ) : (
              <p className="p-3 text-sm text-neutral-500">Choose a service to see its order.</p>
            )}
          </div>
        </div>

        {chosen ? (
          <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              This replaces the {currentLines.length} line{currentLines.length === 1 ? '' : 's'} here with{' '}
              {chosen.lineCount} from {sourceLabel(chosen)} ({dateLabel(chosen.date)}).
            </p>
            {replacedSongs.length ? (
              <p>
                Songs replaced:{' '}
                {replacedSongs
                  .map((l) => [hymnRef(l.hymnBook, l.hymnNumber), songTitle(l)].filter(Boolean).join(' '))
                  .join(', ')}
              </p>
            ) : null}
            {chosen.standalone ? <p className="font-medium">This service will also be marked Standalone.</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!chosen || copy.isPending} onClick={() => copy.mutate()}>
            {copy.isPending ? 'Copying…' : 'Copy order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
