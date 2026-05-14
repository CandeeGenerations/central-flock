import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Spinner} from '@/components/ui/spinner'
import {formatDate, formatDateTime} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {
  type MergeConflict,
  type MergeKeep,
  type MergePreview,
  type RsvpListSummary,
  STATUS_LABELS,
  commitMergeRsvpLists,
  previewMergeRsvpLists,
} from '@/lib/rsvp-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useMemo, useState} from 'react'
import {toast} from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: RsvpListSummary[]
  onMerged: (targetId: number) => void
}

type Step = 'target' | 'conflicts' | 'confirm'

export function RsvpMergeDialog({open, onOpenChange, lists, onMerged}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
        {open && <MergeFlow lists={lists} onClose={() => onOpenChange(false)} onMerged={onMerged} />}
      </DialogContent>
    </Dialog>
  )
}

function MergeFlow({
  lists,
  onClose,
  onMerged,
}: {
  lists: RsvpListSummary[]
  onClose: () => void
  onMerged: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('target')
  const initialTarget = useMemo(() => {
    if (lists.length === 0) return 0
    return [...lists].sort((a, b) => b.counts.total - a.counts.total)[0]!.id
  }, [lists])
  const [targetId, setTargetId] = useState<number>(initialTarget)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [resolutions, setResolutions] = useState<Map<number, MergeKeep>>(new Map())

  // If `lists` changes such that the current target is no longer in it, snap to the new default.
  if (initialTarget && !lists.find((l) => l.id === targetId)) {
    setTargetId(initialTarget)
  }

  const sourceIds = useMemo(() => lists.map((l) => l.id).filter((id) => id !== targetId), [lists, targetId])

  const previewMutation = useMutation({
    mutationFn: () => previewMergeRsvpLists(targetId, sourceIds),
    onSuccess: (data) => {
      setPreview(data)
      const next = new Map<number, MergeKeep>()
      for (const c of data.conflicts) next.set(c.personId, c.defaultKeep)
      setResolutions(next)
      setStep(data.conflicts.length === 0 ? 'confirm' : 'conflicts')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const list =
        preview?.conflicts.map((c) => ({personId: c.personId, keep: resolutions.get(c.personId) ?? c.defaultKeep})) ??
        []
      return commitMergeRsvpLists(targetId, sourceIds, list)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(res.targetId)})
      toast.success(
        `Merged ${res.sourcesDeleted} list${res.sourcesDeleted === 1 ? '' : 's'} into target (${res.entriesAfter} entries)`,
      )
      onMerged(res.targetId)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleNextFromTarget = () => {
    setPreviewing(true)
    previewMutation.mutate(undefined, {onSettled: () => setPreviewing(false)})
  }

  if (lists.length < 2) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Merge lists</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Select at least two lists to merge.</p>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </>
    )
  }

  if (step === 'target') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Merge {lists.length} lists</DialogTitle>
          <DialogDescription>Pick which list survives. The others are folded in and deleted.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 overflow-y-auto">
          {lists.map((l) => (
            <label key={l.id} className="flex items-start gap-3 rounded border p-3 hover:bg-muted cursor-pointer">
              <input
                type="radio"
                name="merge-target"
                checked={targetId === l.id}
                onChange={() => setTargetId(l.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.effectiveDate ? formatDate(l.effectiveDate) : 'No date'} · {l.counts.total} entries
                </div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleNextFromTarget} disabled={previewing || !targetId}>
            {previewing ? <Spinner className="h-4 w-4 mr-1" /> : null}
            Next →
          </Button>
        </DialogFooter>
      </>
    )
  }

  if (step === 'conflicts' && preview) {
    return (
      <ConflictStep
        preview={preview}
        resolutions={resolutions}
        setResolutions={setResolutions}
        onBack={() => setStep('target')}
        onNext={() => setStep('confirm')}
      />
    )
  }

  if (step === 'confirm' && preview) {
    return (
      <ConfirmStep
        preview={preview}
        resolutions={resolutions}
        committing={commitMutation.isPending}
        onBack={() => setStep(preview.conflicts.length === 0 ? 'target' : 'conflicts')}
        onCommit={() => commitMutation.mutate()}
      />
    )
  }

  return null
}

function ConflictStep({
  preview,
  resolutions,
  setResolutions,
  onBack,
  onNext,
}: {
  preview: MergePreview
  resolutions: Map<number, MergeKeep>
  setResolutions: (m: Map<number, MergeKeep>) => void
  onBack: () => void
  onNext: () => void
}) {
  const setKeep = (personId: number, keep: MergeKeep) => {
    const next = new Map(resolutions)
    next.set(personId, keep)
    setResolutions(next)
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Resolve {preview.conflicts.length} conflicts</DialogTitle>
        <DialogDescription>
          People on more than one list. Defaults are pre-selected (most-informative wins) — override any you want.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 overflow-y-auto pr-1">
        {preview.conflicts.map((c) => (
          <ConflictRow
            key={c.personId}
            conflict={c}
            keep={resolutions.get(c.personId) ?? c.defaultKeep}
            onChange={(k) => setKeep(c.personId, k)}
            targetName={preview.targetName}
          />
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onNext}>Next →</Button>
      </DialogFooter>
    </>
  )
}

function ConflictRow({
  conflict,
  keep,
  onChange,
  targetName,
}: {
  conflict: MergeConflict
  keep: MergeKeep
  onChange: (k: MergeKeep) => void
  targetName: string
}) {
  const fullName = `${conflict.firstName ?? ''} ${conflict.lastName ?? ''}`.trim() || `Person #${conflict.personId}`
  const isTargetSelected = keep.kind === 'target'
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="font-medium">{fullName}</div>
      <div className="space-y-1">
        {conflict.target && (
          <OptionRow
            checked={isTargetSelected}
            onChange={() => onChange({kind: 'target'})}
            label={`Keep target — ${targetName}`}
            summary={summarize(conflict.target)}
          />
        )}
        {conflict.sources.map((s) => {
          const checked = keep.kind === 'source' && keep.sourceListId === s.sourceListId
          return (
            <OptionRow
              key={s.sourceListId}
              checked={checked}
              onChange={() => onChange({kind: 'source', sourceListId: s.sourceListId})}
              label={`Keep source — ${s.sourceListName}`}
              summary={summarize(s)}
            />
          )
        })}
      </div>
    </div>
  )
}

function OptionRow({
  checked,
  onChange,
  label,
  summary,
}: {
  checked: boolean
  onChange: () => void
  label: string
  summary: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted">
      <input type="radio" checked={checked} onChange={onChange} className="mt-1" />
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{summary}</div>
      </div>
    </label>
  )
}

function summarize(e: {
  status: string
  headcount: number | null
  note: string | null
  respondedAt: string | null
}): string {
  const parts: string[] = [STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status]
  parts.push(`headcount: ${e.headcount ?? '—'}`)
  parts.push(`note: ${e.note ? truncate(e.note, 40) : '—'}`)
  parts.push(`responded: ${e.respondedAt ? formatDateTime(e.respondedAt) : '—'}`)
  return parts.join(' · ')
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function ConfirmStep({
  preview,
  resolutions,
  committing,
  onBack,
  onCommit,
}: {
  preview: MergePreview
  resolutions: Map<number, MergeKeep>
  committing: boolean
  onBack: () => void
  onCommit: () => void
}) {
  const conflictsResolved = useMemo(() => {
    let keepTarget = 0
    let keepSource = 0
    for (const c of preview.conflicts) {
      const k = resolutions.get(c.personId) ?? c.defaultKeep
      if (k.kind === 'target') keepTarget++
      else keepSource++
    }
    return {keepTarget, keepSource}
  }, [preview, resolutions])

  const tokensLost = preview.tokenLossDefault // worst-case approximation; exact count returned after commit
  const hasBrokenUrls = preview.conflicts.length > 0 || preview.sourceNames.some((s) => s.entryCount > 0)

  const sourceNamesStr = preview.sourceNames.map((s) => `"${s.name}"`).join(', ')
  const targetEntriesBefore =
    preview.totalEntriesAfter - preview.sourceNames.reduce((acc, s) => acc + s.entryCount, 0) + preview.conflicts.length

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Merge {preview.sourceCount + 1} lists into "{preview.targetName}"
        </DialogTitle>
        <DialogDescription>This cannot be undone. Review the summary below.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm overflow-y-auto">
        <div>
          <span className="font-medium">Entries after merge:</span> {preview.totalEntriesAfter}{' '}
          <span className="text-muted-foreground">(target had {targetEntriesBefore})</span>
        </div>
        {preview.conflicts.length > 0 && (
          <div>
            <span className="font-medium">{preview.conflicts.length} conflicts:</span> {conflictsResolved.keepTarget}{' '}
            keep target, {conflictsResolved.keepSource} keep source
          </div>
        )}
        <div>
          <span className="font-medium">Sources to delete:</span> {sourceNamesStr}
        </div>
        <div>
          <span className="font-medium">Event stays:</span> {preview.targetEventLabel}
        </div>
        {preview.sourcesWithDifferentEvent.map((s) => (
          <div key={s.sourceListId} className="text-amber-700 dark:text-amber-400">
            ⚠ "{s.sourceListName}" is linked to a different event ({s.sourceEventLabel}). Its {s.sourceEntryCount}{' '}
            entries will be folded in.
          </div>
        ))}
        {hasBrokenUrls && (
          <div className="text-amber-700 dark:text-amber-400">
            ⚠ {tokensLost} public RSVP link{tokensLost === 1 ? '' : 's'} from removed entries will stop working.
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={committing}>
          ← Back
        </Button>
        <Button variant="destructive" onClick={onCommit} disabled={committing}>
          {committing ? <Spinner className="h-4 w-4 mr-1" /> : null}
          Merge
        </Button>
      </DialogFooter>
    </>
  )
}
