import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchSchedulesSettings, schedulesKeys, updateSchedulesSettings} from '@/lib/schedules-api'
import {rollSheetTitle} from '@/lib/sunday-school-roll-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useEffect, useState} from 'react'
import {toast} from 'sonner'

export function SundaySchoolRollSettingsSection() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const [prefix, setPrefix] = useState('')

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPrefix(settings?.sundaySchoolRoll.titlePrefix ?? ''), [settings])

  const save = useMutation({
    mutationFn: () => updateSchedulesSettings({sundaySchoolRoll: {titlePrefix: prefix}}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.settings})
      toast.success('Saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (!settings) return <PageSpinner />

  const dirty = prefix !== settings.sundaySchoolRoll.titlePrefix

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Printed Title</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Leads the title line on every Roll Sheet. The rest &mdash; year, quarter, month range and the class name
            &mdash; comes from the roll itself and is never typed. The sheet keeps saying &ldquo;Attendance&rdquo;
            because that is the word the teachers read.
          </p>
          <div className="space-y-1">
            <Label>Title prefix</Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Attendance" />
          </div>
          <div className="rounded border bg-white p-3 text-center text-sm font-bold text-black">
            {rollSheetTitle(prefix, 2026, 3, '3 yrs - Kindergarten')}
          </div>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classes &amp; Names</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            There is nothing to configure here on purpose. A class label and its list of names live on the roll itself,
            and a new roll copies the last one &mdash; so classes and rosters carry forward by copying, not by a
            settings list.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
