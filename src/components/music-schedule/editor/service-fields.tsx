import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import type {MusicService} from '@/lib/music-schedule-api'
import {formatServiceTime} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import {Copy, Highlighter, Save, Settings2} from 'lucide-react'
import type {ReactNode} from 'react'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The two notes written week after week; either can go on either field.
const NOTE_SUGGESTIONS = ['(Pastor Candee)', '(Preacher)']

/** The service's own fields as the editor holds them while typing. */
export interface ServiceFieldsDraft {
  title: string
  titleNote: string
  titleHighlight: boolean
  scripture: string
  scriptureNote: string
  scriptureHighlight: boolean
  occasion: string
  meeting: boolean
  uploaded: boolean
  episodeNumber: number | null
  standalone: boolean
  name: string
  time: string | null
  musicHeading: string
  boothHeading: string
}

export function fieldsOf(s: MusicService): ServiceFieldsDraft {
  return {
    title: s.title,
    titleNote: s.titleNote,
    titleHighlight: s.titleHighlight,
    scripture: s.scripture,
    scriptureNote: s.scriptureNote,
    scriptureHighlight: s.scriptureHighlight,
    occasion: s.occasion,
    meeting: s.meeting,
    uploaded: s.uploaded,
    episodeNumber: s.episodeNumber,
    standalone: s.standalone,
    name: s.nameOverride,
    time: s.timeOverride,
    musicHeading: s.musicHeadingOverride,
    boothHeading: s.boothHeadingOverride,
  }
}

export type FieldChange = (patch: Partial<ServiceFieldsDraft>, opts?: {immediate?: boolean}) => void

/** Title, Text, their notes, the Occasion and the week-by-week switches — what gets typed every week. */
export function DetailsStrip({fields, onChange}: {fields: ServiceFieldsDraft; onChange: FieldChange}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
      <Field label="Title">
        <Input value={fields.title} onChange={(e) => onChange({title: e.target.value})} />
        <Note
          value={fields.titleNote}
          highlight={fields.titleHighlight}
          onChange={(titleNote, immediate) => onChange({titleNote}, {immediate})}
          onHighlight={(titleHighlight) => onChange({titleHighlight}, {immediate: true})}
        />
      </Field>
      <Field label="Text">
        <Input value={fields.scripture} onChange={(e) => onChange({scripture: e.target.value})} />
        <Note
          value={fields.scriptureNote}
          highlight={fields.scriptureHighlight}
          onChange={(scriptureNote, immediate) => onChange({scriptureNote}, {immediate})}
          onHighlight={(scriptureHighlight) => onChange({scriptureHighlight}, {immediate: true})}
        />
      </Field>
      <Field label="Occasion (this week only, printed on the heading row)">
        <Input
          value={fields.occasion}
          placeholder="e.g. Thanksgiving Eve Candlelight"
          onChange={(e) => onChange({occasion: e.target.value})}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Field label="Episode">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
              aria-label="Lower the episode number"
              onClick={() => onChange({episodeNumber: Math.max(1, (fields.episodeNumber ?? 1) - 1)}, {immediate: true})}
            >
              −
            </Button>
            <span className="w-12 text-center text-sm">
              {fields.episodeNumber != null ? `#${fields.episodeNumber}` : '—'}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
              aria-label="Raise the episode number"
              onClick={() => onChange({episodeNumber: (fields.episodeNumber ?? 0) + 1}, {immediate: true})}
            >
              +
            </Button>
          </div>
        </Field>
        <label
          className="flex h-8 items-center gap-2 text-sm pointer-coarse:h-10"
          title="Unchecked, it is left off both printed sheets"
        >
          <Checkbox
            checked={fields.meeting}
            onCheckedChange={(v) => onChange({meeting: v === true}, {immediate: true})}
          />
          Meeting
        </label>
        <label
          className="flex h-8 items-center gap-2 text-sm pointer-coarse:h-10"
          title="Goes on the podcast feed, so it gets an episode number"
        >
          <Checkbox
            checked={fields.uploaded}
            onCheckedChange={(v) => onChange({uploaded: v === true}, {immediate: true})}
          />
          Uploaded
        </label>
      </div>
    </div>
  )
}

function Note({
  value,
  highlight,
  onChange,
  onHighlight,
}: {
  value: string
  highlight: boolean
  onChange: (v: string, immediate: boolean) => void
  onHighlight: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 text-xs"
        value={value}
        placeholder="Note — blank prints nothing"
        onChange={(e) => onChange(e.target.value, false)}
      />
      {NOTE_SUGGESTIONS.map((s) => (
        <Button
          key={s}
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 px-2 text-xs pointer-coarse:h-10"
          onClick={() => onChange(s, true)}
        >
          {s}
        </Button>
      ))}
      <Button
        type="button"
        size="icon"
        variant={highlight ? 'default' : 'outline'}
        aria-label="Highlight this note on the printed sheet"
        title="Highlight this note on the printed sheet"
        className="h-8 w-8 shrink-0 pointer-coarse:h-10 pointer-coarse:w-10"
        onClick={() => onHighlight(!highlight)}
      >
        <Highlighter className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/**
 * The rarely touched settings, out of the way: which Service Time, per-week name,
 * time and heading overrides, Standalone, and the two order-wide actions.
 */
export function ServiceSettings({
  service,
  fields,
  serviceTimes,
  onChange,
  onServiceTime,
  onCopyOrder,
  onSaveDefault,
  savingDefault,
}: {
  service: MusicService
  fields: ServiceFieldsDraft
  serviceTimes: {id: number; name: string; dayOfWeek: number; time: string}[]
  onChange: FieldChange
  onServiceTime: (serviceTimeId: number | null) => void
  onCopyOrder: () => void
  onSaveDefault: () => void
  savingDefault: boolean
}) {
  const defaultBlocked = fields.standalone
    ? 'A Standalone order is never saved as the default.'
    : service.serviceTimeId == null
      ? 'A one-off service has no Service Time to be the default for.'
      : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="pointer-coarse:h-10">
          <Settings2 className="mr-1 h-4 w-4" />
          Service settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,26rem)] space-y-4">
        <label className="flex items-start gap-2">
          <Checkbox
            className="mt-0.5"
            checked={fields.standalone}
            onCheckedChange={(v) => onChange({standalone: v === true}, {immediate: true})}
          />
          <span className="text-sm">
            <span className="font-medium">Standalone</span>
            <span className="text-muted-foreground block text-xs">
              This week&rsquo;s order is its own — a candlelight, anniversary or testimony service. The next week copies
              from the last ordinary one instead.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start pointer-coarse:h-10"
            onClick={onCopyOrder}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy order from…
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start pointer-coarse:h-10"
            disabled={!!defaultBlocked || savingDefault}
            onClick={onSaveDefault}
          >
            <Save className="mr-2 h-4 w-4" />
            Save as default order
          </Button>
          <p className="text-muted-foreground text-xs">
            {defaultBlocked ?? 'The starting order for a first week of this service with nothing before it.'}
          </p>
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            Blank means “take it from the Service Time”. Set one only when this week differs.
          </p>
          <Field label="Service">
            <Select
              value={service.serviceTimeId == null ? 'none' : String(service.serviceTimeId)}
              onValueChange={(v) => onServiceTime(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {serviceTimes.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} — {DAY_NAMES[t.dayOfWeek]} {formatServiceTime(t.time)}
                  </SelectItem>
                ))}
                <SelectItem value="none">One-off (no Service Time)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <Input
                value={fields.name}
                placeholder={service.nameDefault || 'from the Service Time'}
                onChange={(e) => onChange({name: e.target.value})}
              />
            </Field>
            <Field label="Time">
              <Input type="time" value={fields.time ?? ''} onChange={(e) => onChange({time: e.target.value || null})} />
            </Field>
          </div>
          <Field label="Music Sheet heading">
            <Input
              value={fields.musicHeading}
              placeholder={service.musicHeadingDefault || 'from Schedules settings'}
              onChange={(e) => onChange({musicHeading: e.target.value})}
            />
          </Field>
          <Field label="Sound Booth heading">
            <Input
              value={fields.boothHeading}
              placeholder={service.boothHeadingDefault || 'from Schedules settings'}
              onChange={(e) => onChange({boothHeading: e.target.value})}
            />
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Field({label, children, className}: {label: string; children: ReactNode; className?: string}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
