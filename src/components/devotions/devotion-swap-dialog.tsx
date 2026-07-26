import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {SearchInput} from '@/components/ui/search-input'
import {Spinner} from '@/components/ui/spinner'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {formatDate} from '@/lib/date'
import {type Devotion, checkDevotionSwap, fetchDevotions, swapDevotions} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, ArrowRightLeft} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

function label(d: Pick<Devotion, 'title' | 'bibleReference' | 'number'>): string {
  return d.title?.trim() || d.bibleReference?.trim() || `#${d.number}`
}

export function DevotionSwapDialog({
  devotion,
  open,
  onOpenChange,
}: {
  devotion: Devotion
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)
  const [target, setTarget] = useState<Devotion | null>(null)

  const reset = () => {
    setSearch('')
    setTarget(null)
  }
  const close = () => {
    onOpenChange(false)
    reset()
  }

  const {data: results, isFetching} = useQuery({
    queryKey: ['devotions', 'swap-picker', debounced],
    queryFn: () => fetchDevotions({search: debounced || undefined, limit: 20, sort: 'number', sortDir: 'desc'}),
    enabled: open && !target,
  })

  const {data: check} = useQuery({
    queryKey: ['devotion-swap-check', devotion.id, target?.id],
    queryFn: () => checkDevotionSwap(devotion.id, target!.id),
    enabled: !!target,
  })

  const swapMut = useMutation({
    mutationFn: () => swapDevotions(devotion.id, target!.id),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['devotions']})
      qc.invalidateQueries({queryKey: ['passages-pool']})
      toast.success('Devotions swapped')
      close()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Swap failed'),
  })

  const options = (results?.data ?? []).filter((d) => d.id !== devotion.id)

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Swap #{devotion.number} with…
          </DialogTitle>
        </DialogHeader>

        {!target ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick a devotion to swap content with. Both keep their number and date; everything inside trades.
            </p>
            <SearchInput placeholder="Search number, title, scripture…" value={search} onChange={setSearch} />
            <div className="max-h-80 overflow-y-auto divide-y rounded-lg border">
              {isFetching && options.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Spinner />
                </div>
              ) : options.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No devotions found.</p>
              ) : (
                options.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setTarget(d)}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">#{d.number}</span> <span className="truncate">{label(d)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(d.date)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">After the swap:</p>
            <div className="space-y-2">
              <SwapRow number={devotion.number} date={devotion.date} from={label(devotion)} to={label(target)} />
              <SwapRow number={target.number} date={target.date} from={label(target)} to={label(devotion)} />
            </div>

            {check && check.referencedNumbers.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {check.referencedNumbers.map((n) => `#${n}`).join(', ')}{' '}
                  {check.referencedNumbers.length === 1 ? 'is' : 'are'} referenced by other devotions' chains. Those
                  references stay on the number and won't follow the content — review the chain audit after swapping.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {target && (
            <Button variant="outline" onClick={() => setTarget(null)} disabled={swapMut.isPending}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={close} disabled={swapMut.isPending}>
            Cancel
          </Button>
          {target && (
            <Button onClick={() => swapMut.mutate()} disabled={swapMut.isPending}>
              {swapMut.isPending ? 'Swapping…' : 'Confirm swap'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SwapRow({number, date, from, to}: {number: number; date: string; from: string; to: string}) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="font-medium">
        #{number} · {formatDate(date)}
      </div>
      <div className="text-muted-foreground flex items-center gap-2 mt-0.5">
        <span className="line-through">{from}</span>
        <ArrowRightLeft className="h-3 w-3" />
        <span className="text-foreground">{to}</span>
      </div>
    </div>
  )
}
