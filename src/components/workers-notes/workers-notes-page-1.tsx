import {PrintPage, TitleBox} from '@/components/print/page-frame'
import {renderWithUnderlines} from '@/lib/render-underlines'
import type {WorkersNotesBlock, WorkersNotesMonth, YearlyTheme} from '@/lib/workers-notes-api'
import {MONTH_NAMES, type WorkersNotesTerm, nextTerm, termLabel, termThroughLabel} from '@/lib/workers-notes-core'
import {type ReactNode, forwardRef} from 'react'

interface Page1Props {
  churchName: string
  year: number
  term: WorkersNotesTerm
  theme: YearlyTheme | null
  blocks: WorkersNotesBlock[]
  months: WorkersNotesMonth[]
  /** Shown instead of the church-name line when the setting is on. */
  logoPath?: string | null
}

const BULLET_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '18px 1fr',
  columnGap: 8,
  fontSize: '11pt',
  lineHeight: 1.35,
  marginBottom: 11,
  textAlign: 'justify',
}

function Bullet({children, bold, region}: {children: ReactNode; bold?: boolean; region?: string}) {
  return (
    <div data-wn-region={region} style={{...BULLET_STYLE, fontWeight: bold ? 700 : 400}}>
      <span aria-hidden style={{fontSize: '11pt', lineHeight: 1.25}}>
        ▪
      </span>
      <span>{children}</span>
    </div>
  )
}

export const WorkersNotesPage1 = forwardRef<HTMLDivElement, Page1Props>(function WorkersNotesPage1(
  {churchName, year, term, theme, blocks, months, logoPath},
  ref,
) {
  const next = nextTerm(year, term)

  return (
    <PrintPage ref={ref}>
      <div style={{textAlign: 'center', marginBottom: 14}}>
        {logoPath ? (
          <div style={{marginBottom: 4}}>
            <img
              src={logoPath}
              alt=""
              style={{maxHeight: 76, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto'}}
              crossOrigin="anonymous"
            />
          </div>
        ) : (
          <div style={{fontSize: '20pt', fontWeight: 700, fontFamily: 'Georgia, serif', letterSpacing: 0.5}}>
            {churchName}
          </div>
        )}
        <div style={{fontSize: '18pt', fontWeight: 700, fontFamily: 'Georgia, serif', letterSpacing: 0.5}}>
          FOUR-MONTH WORKERS&rsquo; NOTES
        </div>
        <div style={{fontSize: '13pt', fontWeight: 700, fontFamily: 'Georgia, serif'}}>Covering the months of</div>
      </div>

      <TitleBox>{termLabel(year, term)}</TitleBox>

      <div style={{fontSize: '11pt', fontWeight: 700, margin: '14px 0 10px'}}>
        Please post the words of the theme chorus and theme verse:
      </div>

      <div style={{fontSize: '11pt', marginBottom: 10}}>
        Our annual theme chorus: (sing it in class, on the bus, wherever you are)
      </div>

      {theme ? (
        <div data-wn-region="theme">
          <div style={{fontSize: '11pt', marginBottom: 8}}>
            <strong>{year} Theme Song</strong> &ndash;{' '}
            <strong style={{textDecoration: 'underline'}}>{theme.songTitle}</strong>
            {theme.songCredit ? (
              <span style={{fontStyle: 'italic', fontSize: '10pt'}}> &mdash;{theme.songCredit}</span>
            ) : null}
          </div>

          <div style={{fontSize: '11pt', fontWeight: 700, lineHeight: 1.4, margin: '0 0 8px 46px'}}>
            {theme.chorusLyrics.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          {theme.tagLyrics.trim() ? (
            <div style={{fontSize: '11pt', display: 'grid', gridTemplateColumns: '46px 1fr', marginBottom: 10}}>
              <div style={{fontWeight: 700}}>Tag:</div>
              <div style={{fontWeight: 700, lineHeight: 1.4}}>
                {theme.tagLyrics.split('\n').map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{fontSize: '11pt', fontWeight: 700, textAlign: 'center', marginBottom: 26}}>
            Verse: &ldquo;{theme.verseText}&rdquo; {theme.verseRef}
          </div>
        </div>
      ) : (
        <div style={{fontSize: '11pt', fontStyle: 'italic', marginBottom: 14}}>
          No {year} theme yet — add one in Schedule Settings.
        </div>
      )}

      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'spacer':
            return <div key={i} style={{height: 10}} />
          case 'note':
            return (
              <Bullet key={i} bold={block.bold} region="blocks">
                {renderWithUnderlines(block.text)}
              </Bullet>
            )
          case 'next_term_forms':
            return (
              <Bullet key={i} region="blocks">
                Forms for {termThroughLabel(next.year, next.term)} will be distributed (as before).
              </Bullet>
            )
          case 'growth_plan':
            return (
              <Bullet key={i} region="theme">
                Our growth plan for the year {year} will be: {renderWithUnderlines(theme?.growthPlan ?? '')}
              </Bullet>
            )
          case 'month_themes':
            return (
              <div key={i} data-wn-region="months">
                <Bullet>Our themes for the next four months are:</Bullet>
                <div style={{margin: '4px 0 0 60px'}}>
                  {months.map((m) => (
                    <div key={m.month} style={{fontSize: '11pt', fontWeight: 700, marginBottom: 12}}>
                      {MONTH_NAMES[m.month - 1]} &ndash; {m.motto}
                    </div>
                  ))}
                </div>
              </div>
            )
          default:
            return null
        }
      })}
    </PrintPage>
  )
})
