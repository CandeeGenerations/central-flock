import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchServiceTimes} from '@/lib/attendance-api'
import {fetchSchedulesSettings, schedulesKeys, uploadSchedulesLogo} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ImagePlus, Trash2} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {toast} from 'sonner'

import {TypeDefaultsCard, saveType} from './shared'

/**
 * Music Schedule settings. The service headings table is the one piece with no
 * equivalent in the other types: the two sheets print different words for the
 * same service ("MORNING SERVICE" vs "SUNDAY MORNING"), so each Service Time
 * carries both. See CONTEXT.md → Music Sheet / Sound Booth Sheet.
 */
export function MusicScheduleSettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const {data: times} = useQuery({queryKey: ['service-times'], queryFn: () => fetchServiceTimes()})

  const graphicInputRef = useRef<HTMLInputElement>(null)
  const uploadGraphic = useMutation({
    mutationFn: (imageData: string) => uploadSchedulesLogo(imageData, 'music_footer'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.settings})
      toast.success('Footer graphic uploaded')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to upload graphic'),
  })

  const [headings, setHeadings] = useState<Record<string, {music: string; booth: string}>>({})
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHeadings(settings?.musicSchedule.serviceHeadings ?? {}), [settings?.musicSchedule.serviceHeadings])

  if (!settings) return <PageSpinner />

  const dirty = JSON.stringify(headings) !== JSON.stringify(settings.musicSchedule.serviceHeadings)
  const active = (times ?? []).filter((t) => t.active)

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Music Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <TypeDefaultsCard
            titleLabel="Title prefix"
            titlePrefix={settings.musicSchedule.titlePrefix}
            footerBlocks={settings.musicSchedule.footerBlocks}
            onSave={(p) => saveType(queryClient, {musicSchedule: p})}
            middleSlot={
              <div className="space-y-2">
                <Label className="text-sm font-medium">Service headings</Label>
                <p className="text-muted-foreground text-xs">
                  The Music Sheet and the Sound Booth Sheet name the same service differently. Blank falls back to the
                  Service Time's name.
                </p>
                <div className="space-y-2">
                  <div className="text-muted-foreground grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs">
                    <span>Service Time</span>
                    <span>Music Sheet</span>
                    <span>Sound Booth</span>
                  </div>
                  {active.map((t) => (
                    <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
                      <span className="text-sm">{t.name}</span>
                      <Input
                        className="h-8 text-xs"
                        placeholder={t.name}
                        value={headings[String(t.id)]?.music ?? ''}
                        onChange={(e) =>
                          setHeadings((prev) => ({
                            ...prev,
                            [t.id]: {music: e.target.value, booth: prev[String(t.id)]?.booth ?? ''},
                          }))
                        }
                      />
                      <Input
                        className="h-8 text-xs"
                        placeholder={t.name}
                        value={headings[String(t.id)]?.booth ?? ''}
                        onChange={(e) =>
                          setHeadings((prev) => ({
                            ...prev,
                            [t.id]: {music: prev[String(t.id)]?.music ?? '', booth: e.target.value},
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                {dirty ? (
                  <Button size="sm" onClick={() => saveType(queryClient, {musicSchedule: {serviceHeadings: headings}})}>
                    Save headings
                  </Button>
                ) : null}
              </div>
            }
          />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Footer</Label>
            <p className="text-muted-foreground text-xs">
              Prints on the Musicians sheet. Settings-only — there is deliberately no per-week override.
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={settings.musicSchedule.footerPlacement}
                onValueChange={(v) =>
                  saveType(queryClient, {
                    musicSchedule: {footerPlacement: v as 'last' | 'every' | 'never'},
                  })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last">Last Musicians page only</SelectItem>
                  <SelectItem value="every">Every Musicians page</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Prints under the verse, centred, at the foot of the sheet. */}
            {settings.musicSchedule.footerImagePath ? (
              <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
                <img
                  src={settings.musicSchedule.footerImagePath}
                  alt="Footer graphic"
                  className="max-h-16 object-contain"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => saveType(queryClient, {musicSchedule: {footerImagePath: null}})}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
            ) : null}
            <input
              ref={graphicInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => uploadGraphic.mutate(reader.result as string)
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploadGraphic.isPending}
              onClick={() => graphicInputRef.current?.click()}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {settings.musicSchedule.footerImagePath ? 'Replace graphic' : 'Upload graphic'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
