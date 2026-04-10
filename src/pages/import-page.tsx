import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {type ImportPreview, executeImport, previewImport} from '@/lib/api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {CheckCircle, FileText, Upload} from 'lucide-react'
import {useRef, useState} from 'react'
import {toast} from 'sonner'

export function ImportPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [importResult, setImportResult] = useState<{
    peopleCreated: number
    peopleUpdated: number
    peopleSkipped: number
    groupsCreated: number
    membershipsCreated: number
  } | null>(null)

  const previewMutation = useMutation({
    mutationFn: previewImport,
    onSuccess: (data) => {
      setPreview(data)
      setImportResult(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('No preview data')
      return executeImport(preview.people, skipDuplicates)
    },
    onSuccess: (data) => {
      setImportResult(data)
      queryClient.invalidateQueries({queryKey: ['people']})
      queryClient.invalidateQueries({queryKey: ['groups']})
      toast.success(`Imported ${data.peopleCreated} people, ${data.groupsCreated} groups`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const csvData = ev.target?.result as string
      previewMutation.mutate(csvData)
    }
    reader.readAsText(file)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-2xl font-bold">Import CSV</h2>

      {/* Upload area */}
      <Card>
        <CardContent className="pt-6">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to upload a CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">
              Expected columns: Phone Number, First Name, Last Name, Groups, Status
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </CardContent>
      </Card>

      {previewMutation.isPending && <div className="text-center py-8 text-muted-foreground">Parsing CSV...</div>}

      {/* Import result */}
      {importResult && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-2xl font-bold">{importResult.peopleCreated}</p>
                <p className="text-sm text-muted-foreground">People Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.peopleUpdated}</p>
                <p className="text-sm text-muted-foreground">People Updated</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.peopleSkipped}</p>
                <p className="text-sm text-muted-foreground">Duplicates Skipped</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.groupsCreated}</p>
                <p className="text-sm text-muted-foreground">Groups Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.membershipsCreated}</p>
                <p className="text-sm text-muted-foreground">Memberships</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && !importResult && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-6">
                <div>
                  <p className="text-2xl font-bold">{preview.totalPeople}</p>
                  <p className="text-sm text-muted-foreground">People</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{preview.groupCount}</p>
                  <p className="text-sm text-muted-foreground">Groups</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-500">{preview.duplicates}</p>
                  <p className="text-sm text-muted-foreground">Duplicates</p>
                </div>
              </div>

              {preview.uniqueGroups.length > 0 && (
                <div>
                  <Label className="text-sm">Groups to create:</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {preview.uniqueGroups.map((g) => (
                      <Badge key={g} variant="outline">
                        {g}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border rounded-lg overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Phone (E.164)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Duplicate?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.people.slice(0, 100).map((p, i) => (
                  <TableRow key={i} className={p.isDuplicate ? 'bg-orange-50 dark:bg-orange-950/20' : ''}>
                    <TableCell>{p.firstName || '—'}</TableCell>
                    <TableCell>{p.lastName || '—'}</TableCell>
                    <TableCell>{p.phoneDisplay}</TableCell>
                    <TableCell className="font-mono text-xs">{p.phoneNumber}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === 'active'
                            ? 'default'
                            : p.status === 'do_not_contact'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {p.status === 'do_not_contact' ? 'do not contact' : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{p.groups.join(', ')}</TableCell>
                    <TableCell>{p.isDuplicate && <Badge variant="destructive">Duplicate</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.people.length > 100 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Showing first 100 of {preview.people.length}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(v === true)} />
              <span className="text-sm">Skip duplicates (same phone number)</span>
            </label>
            <Button size="lg" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? 'Importing...' : `Import ${preview.totalPeople} People`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
