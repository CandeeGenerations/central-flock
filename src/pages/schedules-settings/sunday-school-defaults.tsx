import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {NotesBlockEditor} from './notes-block-editor'
import {saveType} from './shared'

// Defaults used only when there is no previous edition to copy forward from.
export function SundaySchoolDefaultsPane() {
  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  if (!settings) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Page 1 heading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label className="text-sm font-medium">Church name</Label>
          <Input
            defaultValue={settings.workersNotes.churchName}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== settings.workersNotes.churchName) saveType(queryClient, {workersNotes: {churchName: v}})
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default bullets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Seeds the bullet list of a <em>first</em> edition only. Every later edition copies its bullets forward from
            the one before it, so wording you tune on a real edition carries on by itself.
          </p>
          <NotesBlockEditor
            blocks={settings.workersNotes.defaultBlocks.map((b) => ({
              kind: b.kind,
              text: b.text,
              bold: Boolean(b.bold),
            }))}
            onSave={(blocks) => saveType(queryClient, {workersNotes: {defaultBlocks: blocks}})}
          />
        </CardContent>
      </Card>
    </div>
  )
}
