import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchServiceConfig, updateServiceConfig} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'

import {TypeDefaultsCard, saveType} from './shared'

export function NurserySettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const {data: serviceConfig} = useQuery({queryKey: nurseryKeys.serviceConfig, queryFn: fetchServiceConfig})
  const updateConfigMutation = useMutation({
    mutationFn: ({serviceTimeId, workerCount}: {serviceTimeId: number; workerCount: number}) =>
      updateServiceConfig(serviceTimeId, workerCount),
    onSuccess: () => queryClient.invalidateQueries({queryKey: nurseryKeys.serviceConfig}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  if (!settings) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      {/* Nursery */}
      <Card>
        <CardHeader>
          <CardTitle>Nursery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <TypeDefaultsCard
            titleLabel="Title prefix"
            titlePrefix={settings.nursery.titlePrefix}
            footerBlocks={settings.nursery.footerBlocks}
            onSave={(p) => saveType(queryClient, {nursery: p})}
            middleSlot={
              <div>
                <Label className="mb-2 block text-sm font-medium">Service worker counts</Label>
                {serviceConfig?.map((svc) => (
                  <div
                    key={svc.serviceTimeId}
                    className="flex items-center justify-between border-b py-2 last:border-0"
                  >
                    <span className="text-sm">{svc.label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={svc.workerCount === 1 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateConfigMutation.mutate({serviceTimeId: svc.serviceTimeId, workerCount: 1})}
                      >
                        1
                      </Button>
                      <Button
                        variant={svc.workerCount === 2 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateConfigMutation.mutate({serviceTimeId: svc.serviceTimeId, workerCount: 2})}
                      >
                        2
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
