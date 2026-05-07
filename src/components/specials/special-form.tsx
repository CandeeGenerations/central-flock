import {HymnSearchPicker} from '@/components/specials/hymn-search-picker'
import {PerformerMultiPicker} from '@/components/specials/performer-multi-picker'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Textarea} from '@/components/ui/textarea'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type CreateSpecialBody,
  SERVICE_TYPE_LABELS,
  SPECIAL_TYPE_LABELS,
  type ServiceType,
  type SpecialType,
  specialsApi,
} from '@/lib/specials-api'
import {useQuery} from '@tanstack/react-query'
import {AlertTriangle} from 'lucide-react'
import {useEffect, useMemo} from 'react'

export interface SpecialFormState {
  date: string
  serviceType: ServiceType
  serviceLabel: string
  songTitle: string
  hymnId: number | null
  songArranger: string
  songWriter: string
  type: SpecialType
  occasion: string
  performerIds: number[]
  guestPerformers: string[]
  youtubeUrl: string
  notes: string
}

export const emptySpecialFormState = (): SpecialFormState => ({
  date: new Date().toISOString().slice(0, 10),
  serviceType: 'sunday_am',
  serviceLabel: '',
  songTitle: '',
  hymnId: null,
  songArranger: '',
  songWriter: '',
  type: 'solo',
  occasion: '',
  performerIds: [],
  guestPerformers: [],
  youtubeUrl: '',
  notes: '',
})

interface SpecialFormProps {
  state: SpecialFormState
  onChange: (next: SpecialFormState) => void
  excludeSpecialId?: number
}

function deriveType(linked: number, guest: number): SpecialType {
  const total = linked + guest
  if (total <= 1) return 'solo'
  if (total === 2) return 'duet'
  if (total === 3) return 'trio'
  return 'group'
}

export function toCreateBody(state: SpecialFormState): CreateSpecialBody {
  return {
    date: state.date,
    serviceType: state.serviceType,
    serviceLabel: state.serviceLabel || null,
    songTitle: state.songTitle.trim(),
    hymnId: state.hymnId,
    songArranger: state.songArranger || null,
    songWriter: state.songWriter || null,
    type: state.type,
    occasion: state.occasion || null,
    performerIds: state.performerIds,
    guestPerformers: state.guestPerformers,
    youtubeUrl: state.youtubeUrl || null,
    notes: state.notes || null,
  }
}

export function SpecialForm({state, onChange, excludeSpecialId}: SpecialFormProps) {
  const set = <K extends keyof SpecialFormState>(key: K, value: SpecialFormState[K]) => {
    onChange({...state, [key]: value})
  }

  const debouncedSong = useDebouncedValue(state.songTitle, 400)
  const debouncedPerformers = useDebouncedValue(state.performerIds.join(','), 400)

  // Auto-suggest type when count of performers changes — but never silently
  // overwrite a manual choice of 'instrumental' or 'other'.
  const lastSuggestedType = useMemo(
    () => deriveType(state.performerIds.length, state.guestPerformers.length),
    [state.performerIds.length, state.guestPerformers.length],
  )

  useEffect(() => {
    if (state.type === 'instrumental' || state.type === 'other') return
    if (state.type !== lastSuggestedType) {
      onChange({...state, type: lastSuggestedType})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSuggestedType])

  const {data: warnings} = useQuery({
    queryKey: ['special-repeat-warnings', debouncedSong, state.hymnId, debouncedPerformers, excludeSpecialId],
    queryFn: () =>
      specialsApi.repeatWarnings({
        songTitle: state.songTitle.trim() || undefined,
        hymnId: state.hymnId ?? undefined,
        performerIds: state.performerIds,
        excludeSpecialId,
      }),
    enabled: state.songTitle.trim().length > 0 || state.performerIds.length > 0,
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={state.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="service-type">Service</Label>
          <Select value={state.serviceType} onValueChange={(v) => set('serviceType', v as ServiceType)}>
            <SelectTrigger id="service-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SERVICE_TYPE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.serviceType === 'other' && (
            <Input
              className="mt-2"
              placeholder="Service label (e.g. Christmas Eve)"
              value={state.serviceLabel}
              onChange={(e) => set('serviceLabel', e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="song-title">Song title</Label>
        <Input
          id="song-title"
          value={state.songTitle}
          onChange={(e) => set('songTitle', e.target.value)}
          placeholder="e.g. Be Thou My Vision"
        />
        <HymnSearchPicker
          value={state.hymnId}
          onSelect={(hymn) => {
            if (hymn) {
              onChange({
                ...state,
                hymnId: hymn.id,
                songTitle: state.songTitle.trim() ? state.songTitle : hymn.title,
              })
            } else {
              set('hymnId', null)
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="arranger">Arranger</Label>
          <Input
            id="arranger"
            value={state.songArranger}
            onChange={(e) => set('songArranger', e.target.value)}
            placeholder='e.g. "arr. Mark Hayes"'
          />
        </div>
        <div>
          <Label htmlFor="writer">Writer</Label>
          <Input id="writer" value={state.songWriter} onChange={(e) => set('songWriter', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Performers</Label>
        <PerformerMultiPicker
          value={state.performerIds}
          onChange={(ids) => set('performerIds', ids)}
          guestPerformers={state.guestPerformers}
          onGuestChange={(g) => set('guestPerformers', g)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select value={state.type} onValueChange={(v) => set('type', v as SpecialType)}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SPECIAL_TYPE_LABELS) as SpecialType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {SPECIAL_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="occasion">Occasion</Label>
          <Input
            id="occasion"
            value={state.occasion}
            onChange={(e) => set('occasion', e.target.value)}
            placeholder="e.g. Easter, Mother's Day"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="youtube">YouTube URL</Label>
        <Input
          id="youtube"
          value={state.youtubeUrl}
          onChange={(e) => set('youtubeUrl', e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={state.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </div>

      {warnings && (warnings.songRepeat || warnings.performerRepeats.length > 0) && (
        <div className="border rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            Repeat warnings
          </div>
          {warnings.songRepeat && (
            <div className="text-sm text-yellow-900 dark:text-yellow-200">
              Same song performed on {warnings.songRepeat.date}: "{warnings.songRepeat.songTitle}"
            </div>
          )}
          {warnings.performerRepeats.map((r) => (
            <div key={`${r.personId}-${r.specialId}`} className="text-sm text-yellow-900 dark:text-yellow-200">
              Performer #{r.personId} performed on {r.date}.
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SaveBarProps {
  onSave: () => void
  onCancel?: () => void
  saving?: boolean
  saveLabel?: string
}

export function SpecialFormSaveBar({onSave, onCancel, saving, saveLabel = 'Save'}: SaveBarProps) {
  return (
    <div className="flex justify-end gap-2">
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : saveLabel}
      </Button>
    </div>
  )
}
