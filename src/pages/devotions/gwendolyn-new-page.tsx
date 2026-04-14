import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Spinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {type ParseResult, createGwendolynDevotional, parseGwendolynDevotional} from '@/lib/gwendolyn-devotion-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

import {GwendolynDevotionalForm} from './gwendolyn-devotional-form'

export function GwendolynNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [parsing, setParsing] = useState(false)

  async function handleParse() {
    if (!rawText.trim()) return
    setParsing(true)
    try {
      const result = await parseGwendolynDevotional(rawText)
      if (result.warning) toast.warning(`Hashtag generation failed: ${result.warning}`)
      setParsed(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Parse failed')
    } finally {
      setParsing(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: createGwendolynDevotional,
    onSuccess: (data) => {
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotions()})
      navigate(`/devotions/gwendolyn/${data.id}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/devotions/gwendolyn')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">New Devotional</h1>
      </div>

      {!parsed ? (
        <Card size="sm">
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium block mb-4">Paste Gwendolyn's raw text</label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  'HONORED BY GOD\n4-19-26\n📚 One great Biblical truth…\n📖 …the LORD saith… for them that honour me I will honour…\n1 Samuel 2:30\n—Passing the truth along'
                }
                rows={14}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => navigate('/devotions/gwendolyn')}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={parsing || !rawText.trim()}>
                {parsing ? <Spinner size="sm" className="mr-2" /> : null}
                Parse
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Review</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setParsed(null)}>
              ← Re-paste
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <GwendolynDevotionalForm
              initial={{
                title: parsed.title,
                date: parsed.date,
                blocks: parsed.blocks,
                hashtags: parsed.hashtags,
              }}
              onSubmit={(data) => saveMutation.mutate({...data, rawInput: parsed.rawInput})}
              submitLabel="Save"
              submitting={saveMutation.isPending}
              onCancel={() => navigate('/devotions/gwendolyn')}
              cancelLabel="Cancel"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
