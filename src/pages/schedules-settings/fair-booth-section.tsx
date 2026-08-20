import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {fetchGroups} from '@/lib/api'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {FairBoothFooterEditor, saveType} from './shared'

export function FairBoothSettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const {data: groups} = useQuery({queryKey: ['groups'], queryFn: fetchGroups})

  if (!settings) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      {/* Fair Booth */}
      <Card>
        <CardHeader>
          <CardTitle>Fair Booth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Title prefix</Label>
            <Input
              defaultValue={settings.fairBooth.titlePrefix}
              onBlur={(e) => {
                const v = e.target.value
                if (v !== settings.fairBooth.titlePrefix) saveType(queryClient, {fairBooth: {titlePrefix: v}})
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Roster groups</Label>
            <p className="text-muted-foreground text-xs">
              Union of these groups becomes the live fair roster (page 2 of the schedule).
            </p>
            <MultiSelect
              value={settings.fairBooth.rosterGroupIds.map(String)}
              onValueChange={(v) =>
                saveType(queryClient, {
                  fairBooth: {rosterGroupIds: v.map(Number).filter((n) => !Number.isNaN(n))},
                })
              }
              options={(groups ?? []).map((g) => ({value: String(g.id), label: g.name}))}
              placeholder="Pick groups"
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Bold threshold (signups)</Label>
            <p className="text-muted-foreground text-xs">
              Roster names with fewer than this many signups render bold. Default 3.
            </p>
            <Input
              type="number"
              min={0}
              defaultValue={settings.fairBooth.minSignupsForBold}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (!Number.isNaN(n) && n !== settings.fairBooth.minSignupsForBold)
                  saveType(queryClient, {fairBooth: {minSignupsForBold: n}})
              }}
              className="w-24"
            />
          </div>
          <FairBoothFooterEditor
            label="Grid page footer"
            blocks={settings.fairBooth.gridPageFooterBlocks}
            onSave={(blocks) => saveType(queryClient, {fairBooth: {gridPageFooterBlocks: blocks}})}
          />
          <FairBoothFooterEditor
            label="Roster page footer"
            blocks={settings.fairBooth.rosterPageFooterBlocks}
            onSave={(blocks) => saveType(queryClient, {fairBooth: {rosterPageFooterBlocks: blocks}})}
          />
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">&quot;Your Shifts&quot; card copy</Label>
            <p className="text-muted-foreground text-xs">
              Shown under the person&apos;s name on the shifts image you export or text them. Reword &quot;let me
              know&quot; here if you want it to name someone.
            </p>
            <Textarea
              rows={4}
              defaultValue={settings.fairBooth.personalShiftsIntro}
              onBlur={(e) => {
                const v = e.target.value
                if (v !== settings.fairBooth.personalShiftsIntro)
                  saveType(queryClient, {fairBooth: {personalShiftsIntro: v}})
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Reminder send time</Label>
            <p className="text-muted-foreground text-xs">
              What time the nightly &quot;you&apos;re up next&quot; texts go out, the evening before each fair day.
              Changing this re-times every reminder still waiting to send.
            </p>
            <Input
              type="time"
              defaultValue={settings.fairBooth.reminderSendTime}
              onBlur={(e) => {
                const v = e.target.value
                if (/^\d{2}:\d{2}$/.test(v) && v !== settings.fairBooth.reminderSendTime)
                  saveType(queryClient, {fairBooth: {reminderSendTime: v}})
              }}
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
