import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Spinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {type DevotionalBlock, type GwendolynDevotional, type GwendolynStatus} from '@/lib/gwendolyn-devotion-api'
import {ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'

interface Props {
  initial: {
    title: string
    date: string
    blocks: DevotionalBlock[]
    hashtags: string
    status?: GwendolynStatus
  }
  onCancel?: () => void
  cancelLabel?: string
  onSubmit: (data: Omit<GwendolynDevotional, 'id' | 'createdAt' | 'updatedAt'>) => void
  submitLabel: string
  submitting: boolean
  showStatus?: boolean
  onRegenerateHashtags?: () => void
  regenerating?: boolean
}

const STATUS_OPTIONS: {value: GwendolynStatus; label: string}[] = [
  {value: 'received', label: 'Received'},
  {value: 'producing', label: 'Producing'},
  {value: 'waiting_for_approval', label: 'Waiting for Approval'},
  {value: 'ready_to_upload', label: 'Ready to Upload'},
  {value: 'done', label: 'Done'},
]

export function GwendolynDevotionalForm({
  initial,
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

  function updateBlock(index: number, update: Partial<DevotionalBlock>) {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {...b, ...update} as DevotionalBlock
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSubmit({title, date, blocks, hashtags, status, rawInput: null})
  }

  return (
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
              <div>
                <Input
                  value={(block as {reference?: string}).reference ?? ''}
                  onChange={(e) => updateBlock(index, {reference: e.target.value} as Partial<DevotionalBlock>)}
                  placeholder="Reference (e.g. 1 Samuel 2:30)"
                  className={
                    !(block as {reference?: string}).reference?.trim() ? 'border-amber-400 focus:ring-amber-400' : ''
                  }
                />
                {!(block as {reference?: string}).reference?.trim() && (
                  <p className="text-xs text-amber-600 mt-1">No reference — copy output will omit it</p>
                )}
              </div>
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
  )
}
