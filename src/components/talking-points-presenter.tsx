import {Button} from '@/components/ui/button'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {Minus, Plus, X} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'

const MIN_SCALE = 0.6
const MAX_SCALE = 2.4
const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 10) / 10))

interface TalkingPointsPresenterProps {
  open: boolean
  onClose: () => void
  title?: string
  subcode?: string
  reference?: string
  content: string
}

export function TalkingPointsPresenter({
  open,
  onClose,
  title,
  subcode,
  reference,
  content,
}: TalkingPointsPresenterProps) {
  // Reading size for the recording teleprompter, persisted per browser so it
  // sticks across sessions and devices/screens.
  const [fontScale, setFontScale] = usePersistedState('presenter.fontScale', 1)
  const adjustScale = useCallback(
    (delta: number) => setFontScale((s) => clampScale((typeof s === 'number' ? s : 1) + delta)),
    [setFontScale],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') adjustScale(0.1)
      else if (e.key === '-' || e.key === '_') adjustScale(-0.1)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, adjustScale])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-lg font-medium text-muted-foreground truncate">{title || 'Talking Points'}</div>
          {subcode && (
            <div className="font-mono text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
              ({subcode})
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => adjustScale(-0.1)}
              disabled={fontScale <= MIN_SCALE}
              aria-label="Decrease font size"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="font-mono text-xs tabular-nums text-muted-foreground w-10 text-center">
              {Math.round(fontScale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => adjustScale(0.1)}
              disabled={fontScale >= MAX_SCALE}
              aria-label="Increase font size"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ElapsedClock />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 md:px-16 py-10 md:py-16">
        {content.trim() ? (
          <PresenterBody content={content} reference={reference} fontScale={fontScale} />
        ) : (
          <p className="text-2xl text-muted-foreground text-center mt-24">No talking points yet.</p>
        )}
      </div>
    </div>
  )
}

function ElapsedClock() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])
  return <div className="font-mono text-lg tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</div>
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function PresenterBody({content, reference, fontScale}: {content: string; reference?: string; fontScale: number}) {
  const lines = content.split('\n').map((l) => l.trim())
  const bulletLines = lines.filter((l) => /^[-*•]\s+/.test(l)).map((l) => l.replace(/^[-*•]\s+/, ''))
  const nonEmpty = lines.filter(Boolean)
  const isAllBullets = bulletLines.length > 0 && bulletLines.length === nonEmpty.length

  // Sizes are em-based so they scale with the wrapper's font-size, which the
  // user adjusts via the header control. 1.875em/3em match text-3xl/text-5xl at
  // the default scale of 1rem.
  const wrapperStyle = {fontSize: `${fontScale}rem`}

  if (isAllBullets) {
    return (
      <div className="max-w-5xl mx-auto" style={wrapperStyle}>
        {reference && (
          <p className="text-[1.875em] md:text-[3em] leading-snug md:leading-snug font-bold mb-6 md:mb-10 pl-14 md:pl-20">
            {reference}
          </p>
        )}
        <ol className="list-decimal list-outside pl-14 md:pl-20 space-y-6 md:space-y-10 text-[1.875em] md:text-[3em] leading-snug md:leading-snug marker:text-muted-foreground marker:font-semibold">
          {bulletLines.map((item, i) => (
            <li key={i} className="pl-2">
              {item}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto" style={wrapperStyle}>
      {reference && (
        <p className="text-[1.875em] md:text-[3em] leading-snug md:leading-snug font-bold mb-6 md:mb-10">{reference}</p>
      )}
      <pre className="whitespace-pre-wrap font-sans text-[1.875em] md:text-[3em] leading-snug md:leading-snug">
        {content}
      </pre>
    </div>
  )
}
