import type {MusicFooterBlock} from '@/lib/music-schedule-api'

import {TYPE} from './type-scale'

/**
 * The standing footer configured in Schedule Settings — the theme quote, its
 * reference, and the music-note graphic. Settings-only: there is deliberately
 * no per-week override.
 */
export function SheetFooter({blocks, imagePath}: {blocks: MusicFooterBlock[]; imagePath: string | null}) {
  if (!blocks.length && !imagePath) return null
  return (
    <div style={{textAlign: 'center', marginTop: 56}}>
      {blocks.map((b, i) =>
        b.kind === 'spacer' ? (
          <div key={i} style={{height: 10}} />
        ) : (
          <div
            key={i}
            style={{
              fontSize: `${b.kind === 'quote' ? TYPE.footerQuote : TYPE.footerRef}pt`,
              fontStyle: 'italic',
              fontWeight: b.bold ? 700 : 400,
              lineHeight: 1.45,
            }}
          >
            {b.text.split('\n').map((line, j) => (
              <div key={j}>{line}</div>
            ))}
          </div>
        ),
      )}
      {imagePath ? (
        <img
          src={imagePath}
          alt=""
          crossOrigin="anonymous"
          style={{maxHeight: 60, margin: '10px auto 0', display: 'block', objectFit: 'contain'}}
        />
      ) : null}
    </div>
  )
}
