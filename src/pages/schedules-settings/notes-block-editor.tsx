import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Textarea} from '@/components/ui/textarea'
import type {BlockKind, WorkersNotesBlock} from '@/lib/workers-notes-api'
import {ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'

// Kinds a user can add. `note` is the free-text workhorse; the three
// placeholders render from the edition's own Term, Yearly Theme and Mottos and
// therefore carry no text of their own — which is what stops them going stale
// when a block list is copied forward into the next edition.
const KIND_LABELS: Record<BlockKind, string> = {
  note: 'Bullet (free text)',
  spacer: 'Spacer',
  next_term_forms: 'Placeholder — "Forms for …"',
  growth_plan: 'Placeholder — growth plan',
  month_themes: 'Placeholder — month themes',
}

const PLACEHOLDER_HINTS: Partial<Record<BlockKind, string>> = {
  next_term_forms: 'Renders "Forms for <the next term> will be distributed (as before)." from this edition\'s term.',
  growth_plan: 'Renders "Our growth plan for the year <year> will be: …" from the Yearly Theme.',
  month_themes: 'Renders "Our themes for the next four months are:" plus the four Mottos.',
}

const isPlaceholder = (kind: BlockKind) => kind !== 'note' && kind !== 'spacer'

export function NotesBlockEditor({
  blocks,
  onSave,
  saving,
}: {
  blocks: WorkersNotesBlock[]
  onSave: (blocks: WorkersNotesBlock[]) => void
  saving?: boolean
}) {
  const [local, setLocal] = useState<WorkersNotesBlock[]>(blocks)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLocal(blocks), [blocks])
  const dirty = JSON.stringify(local) !== JSON.stringify(blocks)

  const update = (i: number, patch: Partial<WorkersNotesBlock>) =>
    setLocal((prev) => prev.map((b, idx) => (idx === i ? {...b, ...patch} : b)))
  const move = (i: number, delta: number) =>
    setLocal((prev) => {
      const next = [...prev]
      const j = i + delta
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  return (
    <div className="space-y-2">
      {local.map((b, i) => (
        <div key={i} className="bg-muted/30 space-y-2 rounded border p-2">
          <div className="flex items-center gap-2">
            <Select value={b.kind} onValueChange={(v) => update(i, {kind: v as BlockKind, text: ''})}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as BlockKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => move(i, 1)}
                disabled={i === local.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setLocal((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {b.kind === 'note' ? (
            <>
              <Textarea
                rows={4}
                value={b.text}
                onChange={(e) => update(i, {text: e.target.value})}
                placeholder="Bullet text. Wrap a word in _underscores_ to underline it."
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`block-bold-${i}`}
                  checked={b.bold}
                  onCheckedChange={(v) => update(i, {bold: v === true})}
                />
                <Label htmlFor={`block-bold-${i}`} className="text-muted-foreground cursor-pointer text-xs font-normal">
                  Bold
                </Label>
              </div>
            </>
          ) : isPlaceholder(b.kind) ? (
            <p className="text-muted-foreground text-xs italic">{PLACEHOLDER_HINTS[b.kind]}</p>
          ) : null}
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLocal((prev) => [...prev, {kind: 'note', text: '', bold: false}])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add bullet
        </Button>
        {dirty && (
          <Button size="sm" onClick={() => onSave(local)} disabled={saving}>
            Save
          </Button>
        )}
      </div>
    </div>
  )
}
