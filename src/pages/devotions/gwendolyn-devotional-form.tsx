import {ConfirmDialog} from '@/components/confirm-dialog'
import {ScriptureFindings} from '@/components/devotions/scripture-findings'
import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Spinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {
  type BlockCheck,
  type DevotionalBlock,
  type GwendolynDevotionalInput,
  type GwendolynStatus,
  type ScriptureFinding,
  checkGwendolynBlocks,
  countOpenFindings,
  isDismissedBy,
} from '@/lib/gwendolyn-devotion-api'
import {ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {toast} from 'sonner'

interface Props {
  initial: {
    title: string
    date: string
    blocks: DevotionalBlock[]
    hashtags: string
    status?: GwendolynStatus
  }
  // Scripture Check results already computed for `initial.blocks` (from Parse or the detail fetch)
  initialChecks?: (BlockCheck | null)[]
  onCancel?: () => void
  cancelLabel?: string
  onSubmit: (data: GwendolynDevotionalInput) => void
  submitLabel: string
  submitting: boolean
  showStatus?: boolean
  onRegenerateHashtags?: () => void
  regenerating?: boolean
}

type ScriptureBlock = Extract<DevotionalBlock, {type: 'scripture'}>
// What gets checked: the block plus its lead-in, the point before it, which may name the reference
type Checkable = ScriptureBlock & {leadIn?: string}

const STATUS_OPTIONS: {value: GwendolynStatus; label: string}[] = [
  {value: 'received', label: 'Received'},
  {value: 'producing', label: 'Producing'},
  {value: 'waiting_for_approval', label: 'Waiting for Approval'},
  {value: 'ready_to_upload', label: 'Ready to Upload'},
  {value: 'done', label: 'Done'},
]

// Checks are cached by content, so toggling a Dismissal never re-checks. The lead-in only matters
// when the reference is blank.
const checkKey = (b: Checkable) => `${b.text}\u0000${b.reference}\u0000${b.reference.trim() ? '' : (b.leadIn ?? '')}`

function checkablesOf(blocks: DevotionalBlock[]): (Checkable & {index: number})[] {
  return blocks.flatMap((b, index) => {
    if (b.type !== 'scripture' || !b.text.trim()) return []
    const prev = blocks[index - 1]
    return [{...b, leadIn: prev?.type === 'point' ? prev.text : undefined, index}]
  })
}

export function GwendolynDevotionalForm({
  initial,
  initialChecks,
  onCancel,
  cancelLabel = 'Cancel',
  onSubmit,
  submitLabel,
  submitting,
  showStatus = false,
  onRegenerateHashtags,
  regenerating = false,
}: Props) {
  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [blocks, setBlocks] = useState<DevotionalBlock[]>(initial.blocks)
  const [hashtags, setHashtags] = useState(initial.hashtags)
  const [status, setStatus] = useState<GwendolynStatus>(initial.status ?? 'received')
  const [errors, setErrors] = useState<string[]>([])
  const [checks, setChecks] = useState<Map<string, BlockCheck>>(() => {
    const seeded = new Map<string, BlockCheck>()
    for (const b of checkablesOf(initial.blocks)) {
      const c = initialChecks?.[b.index]
      if (c) seeded.set(checkKey(b), c)
    }
    return seeded
  })
  const [aiPending, setAiPending] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const inFlight = useRef(new Set<string>())

  const scripture = checkablesOf(blocks)
  const uncheckedKeys = scripture.map(checkKey).filter((k) => !checks.has(k))
  const uncheckedSignature = uncheckedKeys.join('')

  async function runChecks(targets: Checkable[]): Promise<Map<string, BlockCheck>> {
    const fresh = new Map<string, BlockCheck>()
    if (targets.length === 0) return fresh
    const keys = targets.map(checkKey)
    keys.forEach((k) => inFlight.current.add(k))
    try {
      const {checks: results} = await checkGwendolynBlocks(
        targets.map(({text, reference, leadIn}) => ({type: 'scripture' as const, text, reference, leadIn})),
      )
      results.forEach((c, i) => c && fresh.set(keys[i], c))
      setChecks((prev) => new Map([...prev, ...fresh]))
    } finally {
      keys.forEach((k) => inFlight.current.delete(k))
    }
    return fresh
  }

  // The live re-check: deterministic only, debounced while typing
  useEffect(() => {
    if (!uncheckedSignature) return
    const timer = setTimeout(() => {
      const seen = new Set<string>()
      const targets = scripture.filter((b) => {
        const k = checkKey(b)
        if (checks.has(k) || inFlight.current.has(k) || seen.has(k)) return false
        seen.add(k)
        return true
      })
      runChecks(targets).catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uncheckedSignature])

  async function aiRecheck(block: Checkable) {
    const k = checkKey(block)
    setAiPending((prev) => new Set(prev).add(k))
    try {
      const {text, reference, leadIn} = block
      const {checks: results} = await checkGwendolynBlocks([{type: 'scripture', text, reference, leadIn}], true)
      const c = results[0]
      if (c) setChecks((prev) => new Map(prev).set(k, c))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI re-check failed')
    } finally {
      setAiPending((prev) => {
        const next = new Set(prev)
        next.delete(k)
        return next
      })
    }
  }

  function updateBlock(index: number, update: Partial<DevotionalBlock>) {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {...b, ...update} as DevotionalBlock
      }),
    )
  }

  function setDismissed(index: number, f: ScriptureFinding, dismissed: boolean) {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index || b.type !== 'scripture') return b
        const others = (b.dismissals ?? []).filter((d) => !(d.kind === f.kind && d.basis === f.basis))
        const dismissals = dismissed ? [...others, {kind: f.kind, basis: f.basis}] : others
        return {...b, dismissals}
      }),
    )
  }

  function changeBlockType(index: number, type: 'point' | 'scripture') {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        if (type === 'point') return {type: 'point', text: b.text}
        return {type: 'scripture', text: b.text, reference: (b as {reference?: string}).reference ?? ''}
      }),
    )
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev]
      const swap = index + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[index], next[swap]] = [next[swap], next[index]]
      return next
    })
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }

  function addBlock(type: 'point' | 'scripture') {
    if (type === 'point') {
      setBlocks((prev) => [...prev, {type: 'point', text: ''}])
    } else {
      setBlocks((prev) => [...prev, {type: 'scripture', text: '', reference: ''}])
    }
  }

  function validate(): boolean {
    const errs: string[] = []
    if (!title.trim()) errs.push('Title is required')
    if (!date) errs.push('Date is required')
    if (blocks.length === 0) errs.push('At least one block is required')
    blocks.forEach((b, i) => {
      if (!b.text.trim()) errs.push(`Block ${i + 1} text is empty`)
    })
    setErrors(errs)
    return errs.length === 0
  }

  function submit() {
    onSubmit({title, date, blocks, hashtags, status})
  }

  // The soft gate: open Findings ask for confirmation, never block
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    let all = checks
    const missing = scripture.filter((b) => !checks.has(checkKey(b)))
    if (missing.length) {
      try {
        all = new Map([...checks, ...(await runChecks(missing))])
      } catch {
        // The check is advisory; an unreachable check must not stop a save
      }
    }
    const open = scripture.reduce((n, b) => n + countOpenFindings(all.get(checkKey(b)), b.dismissals), 0)
    if (open > 0) setConfirmOpen(true)
    else submit()
  }

  const openCount = scripture.reduce((n, b) => n + countOpenFindings(checks.get(checkKey(b)), b.dismissals), 0)

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.length > 0 && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive space-y-1">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Devotional title" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {showStatus && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as GwendolynStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-medium">Blocks</label>
          {blocks.map((block, index) => (
            <div key={index} className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2">
                <Select value={block.type} onValueChange={(v) => changeBlockType(index, v as 'point' | 'scripture')}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="point">Point 📚</SelectItem>
                    <SelectItem value="scripture">Scripture 📖</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => moveBlock(index, -1)}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(index, 1)}
                  disabled={index === blocks.length - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className="p-1 rounded hover:bg-destructive/10 text-destructive cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <Textarea
                value={block.text}
                onChange={(e) => updateBlock(index, {text: e.target.value})}
                placeholder={block.type === 'point' ? 'Talking point text…' : 'Scripture quote…'}
                rows={3}
              />

              {block.type === 'scripture' && (
                <>
                  <Input
                    value={block.reference}
                    onChange={(e) => updateBlock(index, {reference: e.target.value} as Partial<DevotionalBlock>)}
                    placeholder="Reference (e.g. 1 Samuel 2:30)"
                  />
                  {(() => {
                    const checkable = scripture.find((c) => c.index === index)
                    if (!checkable) return null
                    return (
                      <ScriptureFindings
                        check={checks.get(checkKey(checkable))}
                        isDismissed={(f) => isDismissedBy(block.dismissals, f)}
                        onFix={(fix) => updateBlock(index, fix as Partial<DevotionalBlock>)}
                        onDismiss={(f) => setDismissed(index, f, true)}
                        onUndismiss={(f) => setDismissed(index, f, false)}
                        onAiRecheck={() => aiRecheck(checkable)}
                        aiPending={aiPending.has(checkKey(checkable))}
                      />
                    )
                  })()}
                </>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => addBlock('point')}>
              <Plus className="h-3 w-3 mr-1" />
              Add point
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addBlock('scripture')}>
              <Plus className="h-3 w-3 mr-1" />
              Add scripture
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Hashtags</label>
            {onRegenerateHashtags && (
              <Button type="button" variant="outline" size="sm" onClick={onRegenerateHashtags} disabled={regenerating}>
                {regenerating ? <Spinner size="sm" className="mr-1" /> : null}
                Regenerate
              </Button>
            )}
          </div>
          <Textarea
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#Worship #Scripture …"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">#Faith #God #Prayer are always prepended on copy</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : (
            <div />
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner size="sm" className="mr-2" /> : null}
            {submitLabel}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Unresolved scripture findings"
        description={`${openCount} scripture ${openCount === 1 ? 'finding is' : 'findings are'} still open. Save anyway?`}
        confirmLabel="Save anyway"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmOpen(false)
          submit()
        }}
      />
    </>
  )
}
