import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchNurserySettings, fetchServiceConfig, updateServiceConfig, uploadNurseryLogo} from '@/lib/nursery-api'
import type {ServiceType} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ImagePlus, Settings} from 'lucide-react'
import {useRef} from 'react'
import {toast} from 'sonner'

export function NurserySettingsPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {data: serviceConfig, isLoading: configLoading} = useQuery({
    queryKey: nurseryKeys.serviceConfig,
    queryFn: fetchServiceConfig,
  })

  const {data: settings, isLoading: settingsLoading} = useQuery({
    queryKey: nurseryKeys.settings,
    queryFn: fetchNurserySettings,
  })

  const updateConfigMutation = useMutation({
    mutationFn: ({type, workerCount}: {type: ServiceType; workerCount: number}) =>
      updateServiceConfig(type, workerCount),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.serviceConfig})
      toast.success('Service config updated')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update'),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: uploadNurseryLogo,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.settings})
      toast.success('Logo uploaded')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to upload logo'),
  })

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      uploadLogoMutation.mutate(result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (configLoading || settingsLoading) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Nursery Settings</h2>
      </div>

      <div className="space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Schedule Logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload an image that will appear at the top of the nursery schedule. This should include your church name
              and tagline.
            </p>
            {settings?.logoPath && (
              <div className="border rounded-lg p-4 bg-white flex justify-center">
                <img src={settings.logoPath} alt="Schedule logo" className="max-h-24 object-contain" />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLogoMutation.isPending}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              {settings?.logoPath ? 'Replace Logo' : 'Upload Logo'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure how many nursery workers are needed for each service.
            </p>
            {serviceConfig?.map((svc) => (
              <div key={svc.serviceType} className="flex items-center justify-between py-2 border-b last:border-0">
                <Label className="text-sm font-medium">{svc.label}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant={svc.workerCount === 1 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateConfigMutation.mutate({type: svc.serviceType, workerCount: 1})}
                  >
                    1 Worker
                  </Button>
                  <Button
                    variant={svc.workerCount === 2 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateConfigMutation.mutate({type: svc.serviceType, workerCount: 2})}
                  >
                    2 Workers
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
