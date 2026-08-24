import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchSchedulesSettings, schedulesKeys, uploadSchedulesLogo} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ImagePlus} from 'lucide-react'
import {useRef} from 'react'
import {toast} from 'sonner'

export function GeneralSettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const compactLogoInputRef = useRef<HTMLInputElement>(null)
  const uploadLogoMutation = useMutation({
    mutationFn: ({imageData, slot}: {imageData: string; slot: 'print' | 'compact'}) =>
      uploadSchedulesLogo(imageData, slot),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.settings})
      toast.success('Logo uploaded')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to upload logo'),
  })

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>, slot: 'print' | 'compact') {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => uploadLogoMutation.mutate({imageData: reader.result as string, slot})
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!settings) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      {/* Global */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Header image at the top of every printed Schedule (nursery + special music). Should include your church name
            and tagline.
          </p>
          {settings.logoPath && (
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <img src={settings.logoPath} alt="Schedule logo" className="max-h-24 object-contain" />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleLogoUpload(e, 'print')}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLogoMutation.isPending}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {settings.logoPath ? 'Replace Logo' : 'Upload Logo'}
          </Button>
        </CardContent>
      </Card>

      {/* Compact logo — the wide print logo reads too small on a 1080-wide
      image card, so cards get their own squarer mark. */}
      <Card>
        <CardHeader>
          <CardTitle>Compact Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Used on shareable image cards (like a person&apos;s Fair Booth shifts), where the wide print logo would
            render too small. Prefer a square or stacked mark. Falls back to the Schedule Logo when not set.
          </p>
          {settings.compactLogoPath && (
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <img src={settings.compactLogoPath} alt="Compact logo" className="max-h-24 object-contain" />
            </div>
          )}
          <input
            ref={compactLogoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleLogoUpload(e, 'compact')}
          />
          <Button
            variant="outline"
            onClick={() => compactLogoInputRef.current?.click()}
            disabled={uploadLogoMutation.isPending}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {settings.compactLogoPath ? 'Replace Compact Logo' : 'Upload Compact Logo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
