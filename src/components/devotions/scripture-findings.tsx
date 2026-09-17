import {Button} from '@/components/ui/button'
import {Spinner} from '@/components/ui/spinner'
import {type BlockCheck, type FindingKind, type ScriptureFinding} from '@/lib/gwendolyn-devotion-api'
import {cn} from '@/lib/utils'
import {AlertTriangle, CheckCircle2, Info, Sparkles, XCircle} from 'lucide-react'
import {useState} from 'react'

// Scripture Check Findings for one Scripture Block — see CONTEXT.md. Read-only on the detail page;
// the edit form passes the handlers that make fixes and Dismissals possible.

const KIND_LABEL: Record<FindingKind, string> = {
  missing_reference: 'Missing reference',
  invalid_reference: 'Invalid reference',
  wrong_reference: 'Wrong reference',
  out_of_range: 'Out of range',
  wording_differs: 'Wording differs',
  not_found: 'Not found',
  reference_format: 'Reference format',
}

const SEVERE: FindingKind[] = ['missing_reference', 'invalid_reference', 'wrong_reference']

function kindTone(kind: FindingKind): {icon: typeof XCircle; className: string} {
  if (SEVERE.includes(kind)) return {icon: XCircle, className: 'text-destructive'}
  if (kind === 'reference_format') return {icon: Info, className: 'text-sky-600 dark:text-sky-400'}
  return {icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400'}
}

function Diff({diff}: {diff: NonNullable<ScriptureFinding['diff']>}) {
  return (
    <p className="text-sm leading-relaxed">
      {diff.map((d, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span
            className={cn(
              d.op === 'del' && 'line-through text-destructive decoration-2',
              d.op === 'ins' && 'rounded bg-green-100 px-0.5 text-green-800 dark:bg-green-900/60 dark:text-green-200',
              d.op === 'gap' && 'text-muted-foreground',
            )}
          >
            {d.word}
          </span>
        </span>
      ))}
    </p>
  )
}

interface Props {
  check: BlockCheck | undefined
  // Whether each Finding is dismissed; the form decides from its own Dismissals, the detail page from the server
  isDismissed?: (f: ScriptureFinding) => boolean
  onFix?: (fix: NonNullable<ScriptureFinding['fix']>) => void
  onDismiss?: (f: ScriptureFinding) => void
  onUndismiss?: (f: ScriptureFinding) => void
  onAiRecheck?: () => void
  aiPending?: boolean
}

export function ScriptureFindings({check, isDismissed, onFix, onDismiss, onUndismiss, onAiRecheck, aiPending}: Props) {
  const [showPassage, setShowPassage] = useState(false)
  const editable = !!onFix

  if (!check) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner size="sm" /> Checking scripture…
      </p>
    )
  }

  const dismissed = (f: ScriptureFinding) => (isDismissed ? isDismissed(f) : !!f.dismissed)
  const open = check.findings.filter((f) => !dismissed(f))

  return (
    <div className="space-y-2">
      {open.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {check.findings.length === 0 ? 'Matches the AKJV' : 'All findings dismissed'}
          {check.passage && (
            <button
              type="button"
              className="ml-1 cursor-pointer text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowPassage((v) => !v)}
            >
              {showPassage ? 'hide text' : 'show text'}
            </button>
          )}
        </p>
      )}
      {showPassage && check.passage && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <span className="font-medium">{check.passage.reference}</span> {check.passage.text}
        </p>
      )}

      {check.findings.map((f) => {
        const isOff = dismissed(f)
        const {icon: Icon, className} = kindTone(f.kind)
        const many = (f.candidates?.length ?? 0) > 1
        return (
          <div
            key={`${f.kind}-${f.basis}`}
            className={cn('space-y-1.5 rounded-md border p-2.5', isOff ? 'opacity-50' : 'bg-background')}
          >
            <div className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', isOff ? 'text-muted-foreground' : className)} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{KIND_LABEL[f.kind]}</span>
                  {isOff && <span className="text-muted-foreground"> · dismissed</span>}
                  <span className="text-muted-foreground"> — {f.message}</span>
                </p>
                {f.diff && !isOff && <Diff diff={f.diff} />}
                {f.aiNote && (
                  <p className="flex items-start gap-1 text-xs italic text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                    {f.aiNote}
                  </p>
                )}
                {!isOff &&
                  f.candidates?.map((c) => (
                    <div key={c.reference} className="flex items-start gap-2 rounded bg-muted/50 p-2 text-xs">
                      <p className="min-w-0 flex-1">
                        <span className="font-medium">{c.reference}</span>{' '}
                        <span className="text-muted-foreground">{c.text}</span>
                      </p>
                      {editable && many && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => onFix!({reference: c.reference})}
                        >
                          Use this one
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
            {editable && (
              <div className="flex flex-wrap justify-end gap-1.5">
                {!isOff && f.fix?.reference && (
                  <Button type="button" size="xs" onClick={() => onFix!({reference: f.fix!.reference})}>
                    Use {f.fix.reference}
                  </Button>
                )}
                {!isOff && f.fix?.text && (
                  <Button type="button" size="xs" onClick={() => onFix!({text: f.fix!.text})}>
                    Use AKJV wording
                  </Button>
                )}
                {!isOff && f.kind === 'not_found' && onAiRecheck && !check.aiChecked && (
                  <Button type="button" size="xs" variant="outline" onClick={onAiRecheck} disabled={aiPending}>
                    {aiPending ? <Spinner size="sm" /> : <Sparkles />}
                    Re-check with AI
                  </Button>
                )}
                {isOff ? (
                  <Button type="button" size="xs" variant="ghost" onClick={() => onUndismiss?.(f)}>
                    Undo dismiss
                  </Button>
                ) : (
                  <Button type="button" size="xs" variant="ghost" onClick={() => onDismiss?.(f)}>
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
