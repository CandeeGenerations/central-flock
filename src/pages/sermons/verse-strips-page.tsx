import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {cn} from '@/lib/utils'
import {generateVerseStripsPdf} from '@/lib/verse-strips-pdf'
import {Download, Scissors} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {toast} from 'sonner'

const FONT_SIZE_OPTIONS = [72, 96, 120, 144]

export function VerseStripsPage() {
  const [reference, setReference] = usePersistedState('sermons.verse-strips.reference', '')
  const [verseText, setVerseText] = usePersistedState('sermons.verse-strips.text', '')
  const [fontSize, setFontSize] = usePersistedState<number>('sermons.verse-strips.fontSize', 96)
  const [generating, setGenerating] = useState(false)
  const [mergedAfter, setMergedAfter] = useState<Set<number>>(new Set())

  const words = useMemo(() => verseText.trim().split(/\s+/).filter(Boolean), [verseText])

  // Reset merge selections when the verse text changes (indices shift on edit).
  useEffect(() => {
    setMergedAfter(new Set())
  }, [verseText])

  const groups = useMemo(() => {
    const result: number[][] = []
    let current: number[] = []
    words.forEach((_, i) => {
      current.push(i)
      const isLast = i === words.length - 1
      if (isLast || !mergedAfter.has(i)) {
        result.push(current)
        current = []
      }
    })
    return result
  }, [words, mergedAfter])

  const phraseStrips = useMemo(() => groups.map((g) => g.map((i) => words[i]).join(' ')), [groups, words])

  const toggleMerge = (i: number) => {
    setMergedAfter((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const trimmedRef = reference.trim()
  const canSubmit = Boolean(trimmedRef) && phraseStrips.length > 0 && !generating

  const handleGenerate = async () => {
    if (!canSubmit) return
    setGenerating(true)
    try {
      const strips = [trimmedRef, ...phraseStrips, trimmedRef]
      await generateVerseStripsPdf({
        strips,
        wordFontSize: fontSize,
        filename: `verse-strips-${slugify(trimmedRef) || 'verse'}.pdf`,
      })
      toast.success('PDF downloaded')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'PDF generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h2 className="text-2xl font-bold">Verse Memorization Strips</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verse Details</CardTitle>
          <p className="text-xs text-muted-foreground">
            Type or paste a Bible verse. Each word becomes a large boxed strip on a printable PDF — cut between words
            and pin them to a memorization board. Use the preview below to merge words into phrase strips.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="verse-reference">Reference</Label>
            <Input
              id="verse-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. John 3:16"
              disabled={generating}
            />
          </div>

          <div>
            <Label htmlFor="verse-text">Verse text</Label>
            <Textarea
              id="verse-text"
              value={verseText}
              onChange={(e) => setVerseText(e.target.value)}
              placeholder="For God so loved the world, that he gave his only begotten Son…"
              rows={4}
              disabled={generating}
            />
          </div>

          <div>
            <Label>Font size</Label>
            <div className="flex gap-2 mt-1">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  disabled={generating}
                  className={cn(
                    'px-3 py-1.5 rounded-md border text-sm transition-colors',
                    fontSize === size
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border',
                    generating && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {size} pt
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <Button onClick={handleGenerate} disabled={!canSubmit} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-1" />
              {generating ? 'Generating PDF…' : 'Generate PDF'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(words.length > 0 || trimmedRef) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4" /> Preview
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Click a word to merge it onto the same strip as the next word; click again to split. Each box below is one
              cut strip on the PDF. The reference prints as both the first and last strip.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {trimmedRef && <ReferenceStrip text={trimmedRef} />}

            {words.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groups.map((group, gi) => (
                  <div
                    key={`group-${gi}-${group.join('-')}`}
                    className="flex items-stretch border border-dashed border-border rounded-md overflow-hidden bg-background"
                  >
                    {group.map((wordIdx, wi) => {
                      const isLastWord = wordIdx === words.length - 1
                      const isLastInGroup = wi === group.length - 1
                      return (
                        <button
                          key={wordIdx}
                          type="button"
                          onClick={() => !isLastWord && toggleMerge(wordIdx)}
                          disabled={isLastWord || generating}
                          title={
                            isLastWord
                              ? 'Last word'
                              : isLastInGroup
                                ? 'Click to merge with the next strip'
                                : 'Click to split this strip here'
                          }
                          className={cn(
                            'px-3 py-1.5 text-base font-semibold transition-colors',
                            !isLastInGroup && 'border-r border-border/50',
                            !isLastWord && !generating && 'cursor-pointer hover:bg-accent',
                            isLastWord && 'cursor-default',
                          )}
                        >
                          {words[wordIdx]}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {trimmedRef && <ReferenceStrip text={trimmedRef} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ReferenceStrip({text}: {text: string}) {
  return (
    <div className="inline-flex border border-dashed border-border rounded-md px-3 py-1.5 text-base font-semibold bg-muted/40">
      {text}
    </div>
  )
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
