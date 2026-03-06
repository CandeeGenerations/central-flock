import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {fetchSettings, updateSetting} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Settings} from 'lucide-react'
import {toast} from 'sonner'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({
    queryKey: queryKeys.settings,
    queryFn: fetchSettings,
  })

  const mutation = useMutation({
    mutationFn: ({key, value}: {key: string; value: string}) => updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.settings})
      toast.success('Setting updated')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const sendMethod = settings?.sendMethod ?? 'api'

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message Sending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="send-method">Send Method</Label>
            <Select value={sendMethod} onValueChange={(value) => mutation.mutate({key: 'sendMethod', value})}>
              <SelectTrigger id="send-method" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api">API (AppleScript)</SelectItem>
                <SelectItem value="ui">UI Scripting (System Events)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sendMethod === 'api' ? (
            <p className="text-sm text-muted-foreground">
              Uses the Messages AppleScript API to send messages directly. Fast and reliable, but only works for SMS
              contacts. iMessage and RCS recipients may not receive messages.
            </p>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Uses System Events to open conversations via the Messages app, paste message content, and press Enter.
                Messages handles routing automatically, so this works for iMessage, RCS, and SMS.
              </p>
              <p className="text-amber-600 dark:text-amber-400">
                Requires Accessibility permissions for your terminal app. Slower (~2s per message) and takes over the
                keyboard/clipboard while sending. Do not interact with the computer during sends.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
