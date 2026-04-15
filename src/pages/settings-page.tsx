import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {fetchAvailableCalendars, fetchSettings, updateSetting} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {type ThemeMode, useTheme} from '@/lib/theme-context'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Monitor, Moon, RefreshCw, Settings, Sun} from 'lucide-react'
import {useMemo, useState} from 'react'
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

  const defaultAiModel = settings?.defaultAiModel ?? 'claude-sonnet-4-5-20250514'
  const webhookUrl = settings?.webhookUrl ?? ''
  const sendTime = settings?.birthdaySendTime ?? '07:00'
  const preNotifyDays = settings?.birthdayPreNotifyDays ?? ''
  const {mode, setMode} = useTheme()

  const churchCalendarNames: string[] = useMemo(() => {
    const raw = settings?.churchCalendarNames
    if (!raw) return []
    try {
      return JSON.parse(raw) as string[]
    } catch {
      return []
    }
  }, [settings])

  const preNotifySet = new Set(preNotifyDays ? preNotifyDays.split(',') : [])

  const togglePreNotifyDay = (day: string) => {
    const next = new Set(preNotifySet)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    const value = [...next].join(',')
    mutation.mutate({key: 'birthdayPreNotifyDays', value})
    mutation.mutate({key: 'anniversaryPreNotifyDays', value})
  }

  const sendTimeHour = parseInt(sendTime.split(':')[0])
  const sendTimeMinute = parseInt(sendTime.split(':')[1])
  const displayHour = sendTimeHour === 0 ? 12 : sendTimeHour > 12 ? sendTimeHour - 12 : sendTimeHour
  const displayAmPm = sendTimeHour < 12 ? 'AM' : 'PM'

  const updateSendTime = (hour12: number, minute: number, amPm: string) => {
    let hour24 = hour12
    if (amPm === 'AM' && hour12 === 12) hour24 = 0
    else if (amPm === 'PM' && hour12 !== 12) hour24 = hour12 + 12
    const hh = String(hour24).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    const value = `${hh}:${mm}`
    mutation.mutate({key: 'birthdaySendTime', value})
    mutation.mutate({key: 'anniversarySendTime', value})
  }

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

      <div className="space-y-4 max-w-2xl">
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
            <CardTitle>AI Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Generation Model</Label>
              <Select value={defaultAiModel} onValueChange={(value) => mutation.mutate({key: 'defaultAiModel', value})}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-sonnet-4-5-20250514">Claude Sonnet 4.5 (Recommended)</SelectItem>
                  <SelectItem value="claude-opus-4-20250514">Claude Opus 4</SelectItem>
                  <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default model used for AI features (devotions, quote research). Sonnet is fast and capable, Opus is the
                most capable, and Haiku is the fastest and cheapest.
              </p>
            </div>
          </CardContent>
        </Card>

        <ChurchCalendarsCard
          selectedNames={churchCalendarNames}
          onSave={(names) => mutation.mutate({key: 'churchCalendarNames', value: JSON.stringify(names)})}
        />

        <Card>
          <CardHeader>
            <CardTitle>Birthdays & Anniversaries</CardTitle>
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
                Pre-notification reminders are sent via webhook. Receives a POST with JSON body containing type,
                personName, message, and daysUntil.
              </p>
              {webhookUrl && (
                <Button variant="outline" size="sm" onClick={testWebhook} disabled={testingWebhook}>
                  {testingWebhook ? 'Testing...' : 'Test Webhook'}
                </Button>
              )}
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
              <Label>Example Messages</Label>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2 text-sm">
                {preNotifySet.size > 0 && (
                  <div>
                    <span className="text-muted-foreground">Pre-notification (via webhook):</span>
                    <p className="font-mono text-xs mt-0.5">
                      &quot;Reminder - {[...preNotifySet][0]} days till John Smith&apos;s birthday!&quot;
                    </p>
                    <p className="font-mono text-xs mt-0.5">
                      &quot;Reminder - {[...preNotifySet][0]} days till John Smith&apos;s anniversary!&quot;
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Birthday (to person):</span>
                  <p className="font-mono text-xs mt-0.5">&quot;Happy 30th birthday to you!&quot;</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Anniversary (to person):</span>
                  <p className="font-mono text-xs mt-0.5">&quot;Happy 5th anniversary!&quot;</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChurchCalendarsCard({selectedNames, onSave}: {selectedNames: string[]; onSave: (names: string[]) => void}) {
  const {data, isLoading, error, refetch, isFetching} = useQuery({
    queryKey: ['available-calendars'],
    queryFn: fetchAvailableCalendars,
    retry: false,
    staleTime: 60_000,
  })

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames])

  const toggle = (name: string) => {
    const next = new Set(selectedSet)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onSave([...next])
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Church Calendars</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Select which Apple Calendar calendars to show in the Calendar section and on the Home page.
        </p>
        {isLoading && <p className="text-sm text-muted-foreground">Loading calendars…</p>}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load calendars'}
          </p>
        )}
        {data?.calendars && data.calendars.length === 0 && (
          <p className="text-sm text-muted-foreground">No calendars found in Calendar.app.</p>
        )}
        {data?.calendars && data.calendars.length > 0 && (
          <div className="space-y-2">
            {data.calendars.map((cal) => (
              <label key={cal.name} className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={selectedSet.has(cal.name)} onCheckedChange={() => toggle(cal.name)} />
                <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{backgroundColor: cal.color}} />
                <span className="text-sm">{cal.name}</span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
