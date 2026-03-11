import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {fetchSettings, updateSetting} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {type ThemeMode, useTheme} from '@/lib/theme-context'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Monitor, Moon, Settings, Sun} from 'lucide-react'
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
  const {mode, setMode} = useTheme()

  const themeOptions: {key: ThemeMode; label: string; icon: typeof Sun}[] = [
    {key: 'light', label: 'Light', icon: Sun},
    {key: 'dark', label: 'Dark', icon: Moon},
    {key: 'system', label: 'System', icon: Monitor},
  ]

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="mb-3 block">Theme</Label>
          <div className="flex gap-2">
            {themeOptions.map(({key, label, icon: Icon}) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors cursor-pointer',
                  mode === key ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card hover:bg-muted/50',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

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
