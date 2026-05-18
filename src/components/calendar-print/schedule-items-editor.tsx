import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import type {NormalScheduleItem, NormalScheduleItemInput} from '@/lib/api'
import {ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2} from 'lucide-react'

export interface DraftItem {
  id?: number
  type: 'line' | 'spacer'
  text: string
  bold: boolean
  column: number
  eligibleDays: string
  hidden: boolean
}

export function itemsToDraft(items: NormalScheduleItem[]): DraftItem[] {
  return items.map((it) => ({
    id: it.id,
    type: it.type,
    text: it.text,
    bold: it.bold,
    column: it.column,
    eligibleDays: it.eligibleDays,
    hidden: it.hidden,
  }))
}

export function draftToInput(items: DraftItem[]): NormalScheduleItemInput[] {
  return items.map((it, idx) => ({
    id: it.id,
    type: it.type,
    text: it.text,
    bold: it.bold,
    column: it.column,
    eligibleDays: it.eligibleDays,
    hidden: it.hidden,
    sortOrder: (idx + 1) * 10,
  }))
}

const DAYS: {key: 'sun' | 'wed' | 'sat'; label: string}[] = [
  {key: 'sun', label: 'Sun'},
  {key: 'wed', label: 'Wed'},
  {key: 'sat', label: 'Sat'},
]

function toggleDay(eligibleDays: string, day: 'sun' | 'wed' | 'sat'): string {
  const current = new Set(eligibleDays.split(',').filter(Boolean))
  if (current.has(day)) current.delete(day)
  else current.add(day)
  return [...DAYS.map((d) => d.key)].filter((d) => current.has(d)).join(',')
}

interface Props {
  items: DraftItem[]
  onChange: (items: DraftItem[]) => void
}

export function ScheduleItemsEditor({items, onChange}: Props) {
  const update = (idx: number, patch: Partial<DraftItem>) => {
    const next = items.slice()
    next[idx] = {...next[idx], ...patch}
    onChange(next)
  }
  const move = (idx: number, delta: number) => {
    const j = idx + delta
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx))
  }
  const addLine = () => {
    onChange([...items, {type: 'line', text: '', bold: false, column: 1, eligibleDays: 'wed,sat', hidden: false}])
  }
  const addSpacer = () => {
    onChange([...items, {type: 'spacer', text: '', bold: false, column: 1, eligibleDays: 'wed,sat', hidden: false}])
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {items.length === 0 && <div className="text-sm text-muted-foreground italic">No items.</div>}
        {items.map((item, idx) => {
          const days = new Set(item.eligibleDays.split(',').filter(Boolean))
          return (
            <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-md border bg-card">
              <div className="flex flex-col">
                <button
                  type="button"
                  className="opacity-50 hover:opacity-100 disabled:opacity-20"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="opacity-50 hover:opacity-100 disabled:opacity-20"
                  disabled={idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-14 text-center">
                {item.type}
              </span>
              {item.type === 'line' ? (
                <Input
                  value={item.text}
                  onChange={(e) => update(idx, {text: e.target.value})}
                  placeholder="Schedule line text (use **text** for inline bold)"
                  className="flex-1 h-8 text-sm"
                />
              ) : (
                <span className="flex-1 text-xs text-muted-foreground italic">(blank line)</span>
              )}
              {item.type === 'line' && (
                <>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <Checkbox checked={item.bold} onCheckedChange={(v) => update(idx, {bold: !!v})} aria-label="Bold" />
                    <span>B</span>
                  </label>
                  <Select value={String(item.column)} onValueChange={(v) => update(idx, {column: Number(v)})}>
                    <SelectTrigger className="w-16 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Col 1</SelectItem>
                      <SelectItem value="2">Col 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-0.5">
                    {DAYS.map((d) => {
                      const on = days.has(d.key)
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => update(idx, {eligibleDays: toggleDay(item.eligibleDays, d.key)})}
                          className={
                            'h-7 px-1.5 text-[10px] rounded border ' +
                            (on
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted text-muted-foreground border-transparent')
                          }
                          aria-pressed={on}
                          aria-label={`Eligible ${d.label}`}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {item.type === 'spacer' && (
                <Select value={String(item.column)} onValueChange={(v) => update(idx, {column: Number(v)})}>
                  <SelectTrigger className="w-16 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Col 1</SelectItem>
                    <SelectItem value="2">Col 2</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <button
                type="button"
                className="opacity-60 hover:opacity-100"
                onClick={() => update(idx, {hidden: !item.hidden})}
                aria-label={item.hidden ? 'Show in footer' : 'Hide from footer'}
                title={item.hidden ? 'Hidden from footer — click to show' : 'Visible in footer — click to hide'}
              >
                {item.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className="opacity-60 hover:opacity-100 text-destructive"
                onClick={() => remove(idx)}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addLine}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add line
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={addSpacer}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add spacer
        </Button>
      </div>
    </div>
  )
}
