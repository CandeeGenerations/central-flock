import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {fetchPeople, fetchSettings, updateSetting} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {type ThemeMode, useTheme} from '@/lib/theme-context'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Monitor, Moon, Settings, Sun} from 'lucide-react'
import {useState} from 'react'
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

  const {data: people} = useQuery({
    queryKey: [...queryKeys.people, 'all-for-settings'],
    queryFn: () => fetchPeople({limit: 1000}),
  })

  const [testingWebhook, setTestingWebhook] = useState(false)

  const testWebhook = async () => {
    setTestingWebhook(true)
    try {
      const res = await fetch('/api/settings/test-webhook', {method: 'POST'})
      const text = await res.text()
      let data: {error?: string; success?: boolean} = {}
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || `Server returned ${res.status}`)
      }
      if (!res.ok) throw new Error(data.error || 'Test failed')
      toast.success('Webhook test successful')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Webhook test failed')
    } finally {
      setTestingWebhook(false)
    }
  }

  const devotionAiModel = settings?.devotionAiModel ?? 'claude-sonnet-4-20250514'
  const sendMethod = settings?.sendMethod ?? 'api'
  const webhookUrl = settings?.webhookUrl ?? ''
  const birthdaySendTime = settings?.birthdaySendTime ?? '07:00'
  const birthdayPreNotifyDays = settings?.birthdayPreNotifyDays ?? ''
  const birthdaySendTo = settings?.birthdaySendTo ?? 'self'
  const birthdayMyContactId = settings?.birthdayMyContactId ?? ''
  const anniversarySendTime = settings?.anniversarySendTime ?? '07:00'
  const anniversaryPreNotifyDays = settings?.anniversaryPreNotifyDays ?? ''
  const anniversarySendTo = settings?.anniversarySendTo ?? 'self'
  const {mode, setMode} = useTheme()

  const preNotifySet = new Set(birthdayPreNotifyDays ? birthdayPreNotifyDays.split(',') : [])

  const togglePreNotifyDay = (day: string) => {
    const next = new Set(preNotifySet)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    mutation.mutate({key: 'birthdayPreNotifyDays', value: [...next].join(',')})
  }

  const annivPreNotifySet = new Set(anniversaryPreNotifyDays ? anniversaryPreNotifyDays.split(',') : [])

  const toggleAnnivPreNotifyDay = (day: string) => {
    const next = new Set(annivPreNotifySet)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    mutation.mutate({key: 'anniversaryPreNotifyDays', value: [...next].join(',')})
  }

  const sendTimeHour = parseInt(birthdaySendTime.split(':')[0])
  const sendTimeMinute = parseInt(birthdaySendTime.split(':')[1])
  const displayHour = sendTimeHour === 0 ? 12 : sendTimeHour > 12 ? sendTimeHour - 12 : sendTimeHour
  const displayAmPm = sendTimeHour < 12 ? 'AM' : 'PM'

  const annivSendTimeHour = parseInt(anniversarySendTime.split(':')[0])
  const annivSendTimeMinute = parseInt(anniversarySendTime.split(':')[1])
  const annivDisplayHour =
    annivSendTimeHour === 0 ? 12 : annivSendTimeHour > 12 ? annivSendTimeHour - 12 : annivSendTimeHour
  const annivDisplayAmPm = annivSendTimeHour < 12 ? 'AM' : 'PM'

  const updateSendTime = (hour12: number, minute: number, amPm: string) => {
    let hour24 = hour12
    if (amPm === 'AM' && hour12 === 12) hour24 = 0
    else if (amPm === 'PM' && hour12 !== 12) hour24 = hour12 + 12
    const hh = String(hour24).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    mutation.mutate({key: 'birthdaySendTime', value: `${hh}:${mm}`})
  }

  const updateAnnivSendTime = (hour12: number, minute: number, amPm: string) => {
    let hour24 = hour12
    if (amPm === 'AM' && hour12 === 12) hour24 = 0
    else if (amPm === 'PM' && hour12 !== 12) hour24 = hour12 + 12
    const hh = String(hour24).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    mutation.mutate({key: 'anniversarySendTime', value: `${hh}:${mm}`})
  }

  const peopleOptions = (people?.data || []).map((p) => ({
    value: String(p.id),
    label: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.phoneDisplay || p.phoneNumber || `#${p.id}`,
  }))

  const themeOptions: {key: ThemeMode; label: string; icon: typeof Sun}[] = [
    {key: 'light', label: 'Light', icon: Sun},
    {key: 'dark', label: 'Dark', icon: Moon},
    {key: 'system', label: 'System', icon: Monitor},
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
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
                      'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer',
                      mode === key
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:bg-muted/50',
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
                    Uses System Events to open conversations via the Messages app, paste message content, and press
                    Enter. Messages handles routing automatically, so this works for iMessage, RCS, and SMS.
                  </p>
                  <p className="text-amber-600 dark:text-amber-400">
                    Requires Accessibility permissions for your terminal app. Slower (~2s per message) and takes over
                    the keyboard/clipboard while sending. Do not interact with the computer during sends.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI / Devotions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Generation Model</Label>
                <Select
                  value={devotionAiModel}
                  onValueChange={(value) => mutation.mutate({key: 'devotionAiModel', value})}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recommended)</SelectItem>
                    <SelectItem value="claude-opus-4-20250514">Claude Opus 4</SelectItem>
                    <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Model used for generating devotion passages. Sonnet is fast and capable, Opus is the most capable, and
                  Haiku is the fastest and cheapest.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={webhookUrl}
                  onChange={(e) => mutation.mutate({key: 'webhookUrl', value: e.target.value})}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Used for birthday/anniversary reminders and &quot;send to myself&quot; notifications. Receives a POST
                  with JSON body containing type, personName, message, and daysUntil.
                </p>
              </div>
              {webhookUrl && (
                <Button variant="outline" size="sm" onClick={testWebhook} disabled={testingWebhook}>
                  {testingWebhook ? 'Testing...' : 'Test Webhook'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Birthdays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>My Contact</Label>
                <SearchableSelect
                  value={birthdayMyContactId}
                  onValueChange={(value) => mutation.mutate({key: 'birthdayMyContactId', value})}
                  options={peopleOptions}
                  placeholder="Select your contact..."
                  className="w-64"
                />
                <p className="text-xs text-muted-foreground">
                  Who are you in the people list? &quot;Send to myself&quot; texts go to this person&apos;s phone
                  number.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Send Time</Label>
                <div className="flex gap-2">
                  <Select
                    value={String(displayHour)}
                    onValueChange={(v) => updateSendTime(Number(v), sendTimeMinute, displayAmPm)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(sendTimeMinute)}
                    onValueChange={(v) => updateSendTime(displayHour, Number(v), displayAmPm)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => (
                        <SelectItem key={i * 5} value={String(i * 5)}>
                          {String(i * 5).padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={displayAmPm} onValueChange={(v) => updateSendTime(displayHour, sendTimeMinute, v)}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pre-notification Days</Label>
                <div className="flex gap-4">
                  {['3', '7', '10'].map((day) => (
                    <label key={day} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={preNotifySet.has(day)} onCheckedChange={() => togglePreNotifyDay(day)} />
                      <span className="text-sm">{day} days before</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Send Birthday Text To</Label>
                <Select
                  value={birthdaySendTo}
                  onValueChange={(value) => mutation.mutate({key: 'birthdaySendTo', value})}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>
                    <SelectItem value="person">The Person</SelectItem>
                  </SelectContent>
                </Select>
                {birthdaySendTo === 'person' && (
                  <p className="text-xs text-muted-foreground">
                    People without a phone number will be sent via webhook instead.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Example Messages</Label>
                <div className="rounded-lg border bg-muted/50 p-3 space-y-2 text-sm">
                  {preNotifySet.size > 0 && (
                    <div>
                      <span className="text-muted-foreground">Pre-notification (via webhook):</span>
                      <p className="font-mono text-xs mt-0.5">
                        &quot;Reminder - {[...preNotifySet][0]} days till John Smith&apos;s birthday!&quot;
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">
                      With year ({birthdaySendTo === 'person' ? 'to person' : 'via webhook'}):
                    </span>
                    <p className="font-mono text-xs mt-0.5">
                      {birthdaySendTo === 'person'
                        ? '"Happy 30th birthday to you!"'
                        : '"Happy 30th birthday to John Smith"'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Without year ({birthdaySendTo === 'person' ? 'to person' : 'via webhook'}):
                    </span>
                    <p className="font-mono text-xs mt-0.5">
                      {birthdaySendTo === 'person' ? '"Happy birthday to you!"' : '"Happy birthday to John Smith"'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anniversaries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Send Time</Label>
                <div className="flex gap-2">
                  <Select
                    value={String(annivDisplayHour)}
                    onValueChange={(v) => updateAnnivSendTime(Number(v), annivSendTimeMinute, annivDisplayAmPm)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(annivSendTimeMinute)}
                    onValueChange={(v) => updateAnnivSendTime(annivDisplayHour, Number(v), annivDisplayAmPm)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => (
                        <SelectItem key={i * 5} value={String(i * 5)}>
                          {String(i * 5).padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={annivDisplayAmPm}
                    onValueChange={(v) => updateAnnivSendTime(annivDisplayHour, annivSendTimeMinute, v)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pre-notification Days</Label>
                <div className="flex gap-4">
                  {['3', '7', '10'].map((day) => (
                    <label key={day} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={annivPreNotifySet.has(day)}
                        onCheckedChange={() => toggleAnnivPreNotifyDay(day)}
                      />
                      <span className="text-sm">{day} days before</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Send Anniversary Text To</Label>
                <Select
                  value={anniversarySendTo}
                  onValueChange={(value) => mutation.mutate({key: 'anniversarySendTo', value})}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>
                    <SelectItem value="person">The Person</SelectItem>
                  </SelectContent>
                </Select>
                {anniversarySendTo === 'person' && (
                  <p className="text-xs text-muted-foreground">
                    People without a phone number will be sent via webhook instead.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Example Messages</Label>
                <div className="rounded-lg border bg-muted/50 p-3 space-y-2 text-sm">
                  {annivPreNotifySet.size > 0 && (
                    <div>
                      <span className="text-muted-foreground">Pre-notification (via webhook):</span>
                      <p className="font-mono text-xs mt-0.5">
                        &quot;Reminder - {[...annivPreNotifySet][0]} days till John Smith&apos;s anniversary!&quot;
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">
                      With year ({anniversarySendTo === 'person' ? 'to person' : 'via webhook'}):
                    </span>
                    <p className="font-mono text-xs mt-0.5">
                      {anniversarySendTo === 'person'
                        ? '"Happy 5th anniversary!"'
                        : '"Happy 5th anniversary to John Smith"'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Without year ({anniversarySendTo === 'person' ? 'to person' : 'via webhook'}):
                    </span>
                    <p className="font-mono text-xs mt-0.5">
                      {anniversarySendTo === 'person' ? '"Happy anniversary!"' : '"Happy anniversary to John Smith"'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
