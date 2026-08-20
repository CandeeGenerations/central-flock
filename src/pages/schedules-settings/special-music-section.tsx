import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchGroups} from '@/lib/api'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {HouseholdsSection, TypeDefaultsCard, saveType} from './shared'

export function SpecialMusicSettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const {data: groups} = useQuery({queryKey: ['groups'], queryFn: fetchGroups})

  if (!settings) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      {/* Special Music */}
      <Card>
        <CardHeader>
          <CardTitle>Special Music</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <TypeDefaultsCard
            titleLabel="Title prefix"
            titlePrefix={settings.specialMusic.titlePrefix}
            footerBlocks={settings.specialMusic.footerBlocks}
            onSave={(p) => saveType(queryClient, {specialMusic: p})}
            middleSlot={
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Singer pool (groups)</Label>
                <p className="text-muted-foreground text-xs">
                  Cell editor's people picker filters to members of these groups, deduplicated.
                </p>
                <MultiSelect
                  value={settings.specialMusic.singerGroupIds.map(String)}
                  onValueChange={(v) =>
                    saveType(queryClient, {
                      specialMusic: {singerGroupIds: v.map(Number).filter((n) => !Number.isNaN(n))},
                    })
                  }
                  options={(groups ?? []).map((g) => ({value: String(g.id), label: g.name}))}
                  placeholder="Pick groups"
                  className="w-full"
                />
              </div>
            }
          />
          <HouseholdsSection singerGroupIds={settings.specialMusic.singerGroupIds} />
        </CardContent>
      </Card>
    </div>
  )
}
