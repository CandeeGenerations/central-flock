import {ColorSwatches} from '@/components/prayer-sheet/color-swatches'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import type {PrayerSheetMinistryItem, PrayerSheetSettings} from '@/lib/api'
import {
  fetchPrayerSheetMinistryItems,
  fetchPrayerSheetSettings,
  updatePrayerSheetMinistryItems,
  updatePrayerSheetSettings,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Bold, GripVertical, Plus, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {toast} from 'sonner'

const SUNDAY_LABELS = ['1st Sunday', '2nd Sunday', '3rd Sunday', '4th Sunday', '5th Sunday'] as const
const COLOR_KEYS = ['colorSunday1', 'colorSunday2', 'colorSunday3', 'colorSunday4', 'colorSunday5'] as const

type ColorKey = (typeof COLOR_KEYS)[number]

// ─── Color rotation slot ──────────────────────────────────────────────────────

function ColorSlot({
  label,
  value,
  usedColors,
  onChange,
}: {
  label: string
  value: string
  usedColors: Set<string>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-24 shrink-0 text-muted-foreground">{label}</span>
      <ColorSwatches value={value} onChange={onChange} usedColors={usedColors} />
    </div>
  )
}

// ─── Ministry item row ────────────────────────────────────────────────────────

type DraftItem = {id: string; text: string; bold: boolean}

function ministryToDraft(items: PrayerSheetMinistryItem[]): DraftItem[] {
  return items.map((item) => ({id: String(item.id), text: item.text, bold: item.bold}))
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PrayerSheetSettingsSection() {
  const queryClient = useQueryClient()

  const {data: settings, isLoading: settingsLoading} = useQuery({
    queryKey: queryKeys.prayerSheetSettings,
    queryFn: fetchPrayerSheetSettings,
  })
  const {data: ministryItems, isLoading: ministryLoading} = useQuery({
    queryKey: queryKeys.prayerSheetMinistryItems,
    queryFn: fetchPrayerSheetMinistryItems,
  })

  // ── Settings form state ──
  const [title, setTitle] = useState('')
  const [scriptureText, setScriptureText] = useState('')
  const [scriptureReference, setScriptureReference] = useState('')
  const [colors, setColors] = useState<Record<ColorKey, string>>({
    colorSunday1: '#1D4ED8',
    colorSunday2: '#15803D',
    colorSunday3: '#B91C1C',
    colorSunday4: '#B45309',
    colorSunday5: '#6D28D9',
  })

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!settings) return
    // oxlint-disable-next-line react/set-state-in-effect
    setTitle(settings.title)
    setScriptureText(settings.scriptureText)
    setScriptureReference(settings.scriptureReference)
    setColors({
      colorSunday1: settings.colorSunday1,
      colorSunday2: settings.colorSunday2,
      colorSunday3: settings.colorSunday3,
      colorSunday4: settings.colorSunday4,
      colorSunday5: settings.colorSunday5,
    })
  }, [settings])

  const saveSettings = useMutation({
    mutationFn: (data: Partial<PrayerSheetSettings>) => updatePrayerSheetSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetSettings})
      toast.success('Settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  // ── Ministry list state ──
  const [ministryDraft, setMinistryDraft] = useState<DraftItem[]>([])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (ministryItems) setMinistryDraft(ministryToDraft(ministryItems))
  }, [ministryItems])

  const saveMinistry = useMutation({
    mutationFn: (items: {text: string; bold: boolean; sortOrder: number}[]) => updatePrayerSheetMinistryItems(items),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetMinistryItems})
      toast.success('Ministry list saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (settingsLoading || ministryLoading) return <PageSpinner />

  function addMinistryItem() {
    setMinistryDraft((prev) => [...prev, {id: `new-${Date.now()}`, text: '', bold: false}])
  }

  function updateMinistryItem(id: string, patch: Partial<DraftItem>) {
    setMinistryDraft((prev) => prev.map((item) => (item.id === id ? {...item, ...patch} : item)))
  }

  function removeMinistryItem(id: string) {
    setMinistryDraft((prev) => prev.filter((item) => item.id !== id))
  }

  function handleSaveSettings() {
    saveSettings.mutate({
      title,
      scriptureText,
      scriptureReference,
      ...colors,
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* ── Title & Scripture ── */}
      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Scripture text</Label>
            <Textarea
              value={scriptureText}
              onChange={(e) => setScriptureText(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scripture reference</Label>
            <Input value={scriptureReference} onChange={(e) => setScriptureReference(e.target.value)} />
          </div>
          <Button onClick={handleSaveSettings} disabled={saveSettings.isPending}>
            {saveSettings.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Color rotation ── */}
      <Card>
        <CardHeader>
          <CardTitle>Color Rotation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each new edition auto-picks the color for that Sunday&apos;s position in the month. Colors are mutually
            exclusive — once one is chosen, it&apos;s unavailable for others.
          </p>
          {COLOR_KEYS.map((key, idx) => (
            <ColorSlot
              key={key}
              label={SUNDAY_LABELS[idx]}
              value={colors[key]}
              usedColors={
                new Set(
                  Object.entries(colors)
                    .filter(([k]) => k !== key)
                    .map(([, v]) => v),
                )
              }
              onChange={(v) => setColors((prev) => ({...prev, [key]: v}))}
            />
          ))}
          <Button onClick={handleSaveSettings} disabled={saveSettings.isPending} className="mt-2">
            {saveSettings.isPending ? 'Saving…' : 'Save Colors'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Ministry list ── */}
      <Card>
        <CardHeader>
          <CardTitle>Ministry List (Back Page)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Printed on the back of every prayer sheet. Rarely changes.</p>
          <div className="space-y-2">
            {ministryDraft.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                <Input
                  className={cn('flex-1', item.bold && 'font-bold')}
                  value={item.text}
                  onChange={(e) => updateMinistryItem(item.id, {text: e.target.value})}
                />
                <Button
                  variant={item.bold ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  className="shrink-0"
                  aria-pressed={item.bold}
                  onClick={() => updateMinistryItem(item.id, {bold: !item.bold})}
                  title="Toggle bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeMinistryItem(item.id)}
                  title="Remove line"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={addMinistryItem}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add item
            </Button>
            <Button
              size="sm"
              onClick={() =>
                saveMinistry.mutate(ministryDraft.map(({text, bold}, idx) => ({text, bold, sortOrder: idx})))
              }
              disabled={saveMinistry.isPending}
            >
              {saveMinistry.isPending ? 'Saving…' : 'Save Ministry List'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
