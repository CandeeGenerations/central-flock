import type {MusicService} from '@/lib/music-schedule-api'
import {
  type BoothRow,
  type RenderedLine,
  boothHeading,
  musicHeading as buildMusicHeading,
  renderLine,
  resolveBoothRows,
} from '@/lib/music-schedule-core'
import {renderInline} from '@/lib/render-inline-markup'
import type {CSSProperties} from 'react'

import {
  BOOTH_COL_GAP_PX,
  BOOTH_LABEL_COL_PX,
  CELL_PAD,
  CELL_PAD_DENSE,
  HIGHLIGHT,
  MUSIC_BLOCK_WIDTH_PX,
  MUSIC_COL_GAP_PX,
  MUSIC_LEFT_COL_MIN_PX,
  ROW_GAP_PX,
  SERVICE_GAP_PX,
  TYPE,
} from './type-scale'

const HEADING_STYLE: CSSProperties = {
  fontSize: `${TYPE.serviceHeading}pt`,
  fontWeight: 700,
  textDecoration: 'underline',
  marginBottom: 4,
}

function rowStyle(row: {bold: boolean; italic: boolean; highlight: boolean}, opts?: {dense?: boolean}): CSSProperties {
  return {
    fontSize: `${TYPE.body}pt`,
    lineHeight: opts?.dense ? 1.2 : 1.35,
    padding: opts?.dense ? CELL_PAD_DENSE : CELL_PAD,
    fontWeight: row.bold ? 700 : 400,
    fontStyle: row.italic ? 'italic' : 'normal',
    backgroundColor: row.highlight ? HIGHLIGHT : undefined,
  }
}

/**
 * One Service Order as rows of a two-column table. Split rows fill both cells;
 * merged rows span the width. A single grid per service, so every row shares
 * one pair of column stops and the left column widens to whatever its longest
 * cell needs rather than wrapping it. Pure render — no handlers, no cursor
 * styles — so the export path can mount it directly (ADR 0005).
 */
export function MusicServiceBlock({service}: {service: MusicService}) {
  const lines = service.lines.filter((l) => l.kind !== 'page_break')
  const rendered: RenderedLine[] = lines.map((l, i) => renderLine(l, service, i === 0))

  return (
    <div style={{paddingBottom: SERVICE_GAP_PX}}>
      {/* Fixed width, centred: the block sits in from both margins the way the
          paper original does, and every service shares the same column stops.
          data-ms-service sits here, not on the padded wrapper, so the edit
          overlay traces the printed block rather than the gap after it. */}
      <div data-ms-service={service.id} style={{width: MUSIC_BLOCK_WIDTH_PX, margin: '0 auto'}}>
        <div style={HEADING_STYLE}>{renderInline(buildMusicHeading(service.date, service.musicHeading))}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(${MUSIC_LEFT_COL_MIN_PX}px, max-content) 1fr`,
            columnGap: MUSIC_COL_GAP_PX,
            // Cells carry their own padding; pull back so text still starts on
            // the block's own left edge, under the heading.
            margin: '0 -8px',
          }}
        >
          {rendered.map((r) =>
            r.merged ? (
              <div
                key={r.id}
                style={{
                  ...rowStyle(r, {dense: true}),
                  gridColumn: '1 / -1',
                  textAlign: r.align === 'center' ? 'center' : 'left',
                }}
              >
                {renderInline(r.left ? `${r.left} ${r.right}` : r.right)}
                {r.suffix ? <span style={{fontWeight: 400}}> {renderInline(r.suffix)}</span> : null}
              </div>
            ) : (
              <SplitCells key={r.id} row={r} />
            ),
          )}
        </div>
      </div>
    </div>
  )
}

function SplitCells({row}: {row: RenderedLine}) {
  const style = rowStyle(row, {dense: true})
  return (
    <>
      <div style={{...style, whiteSpace: 'nowrap'}}>{renderInline(row.left)}</div>
      <div style={style}>
        {renderInline(row.right)}
        {row.suffix ? <span style={{fontWeight: 400}}> {renderInline(row.suffix)}</span> : null}
      </div>
    </>
  )
}

/**
 * The same service condensed for the sound team. One grid per block, sharing a
 * single label-column width across every block on the sheet and filling the
 * page width; merged rows span both columns.
 *
 * Highlighting follows the paper: a split row highlights its LABEL cell only —
 * the "(No Choir)" / "(Pastor Candee)" annotation is what's exceptional, not the
 * song — while a merged row bands the full width.
 */
export function BoothServiceBlock({service, showRule = true}: {service: MusicService; showRule?: boolean}) {
  const rows = resolveBoothRows(service, service.lines, service.boothLines)

  return (
    <div style={{paddingBottom: SERVICE_GAP_PX}}>
      <div
        data-ms-service={service.id}
        style={{
          display: 'grid',
          gridTemplateColumns: `${BOOTH_LABEL_COL_PX}px 1fr`,
          columnGap: BOOTH_COL_GAP_PX,
          rowGap: ROW_GAP_PX,
          margin: '0 -8px',
        }}
      >
        <div style={rowStyle({bold: true, italic: false, highlight: false})}>
          <span style={{textDecoration: 'underline'}}>{renderInline(service.boothHeading.toUpperCase())}:</span>
        </div>
        <div style={rowStyle({bold: true, italic: false, highlight: false})}>
          <span style={{textDecoration: 'underline'}}>{boothHeading(service.date)}</span>
        </div>

        {rows.map((r) =>
          r.merged ? (
            <div
              key={r.key}
              style={{
                ...rowStyle({bold: false, italic: false, highlight: r.highlight}),
                gridColumn: '1 / -1',
                textAlign: 'center',
              }}
            >
              {renderInline(r.value)}
            </div>
          ) : (
            <BoothCells key={r.key} row={r} />
          ),
        )}
      </div>
      {/* The rule the paper draws between services. */}
      {showRule ? <div style={{borderBottom: '2px solid #000', margin: `${SERVICE_GAP_PX}px -8px 0`}} /> : null}
    </div>
  )
}

function BoothCells({row}: {row: BoothRow}) {
  const isSong = row.kind === 'song'
  const inlineNote = row.kind === 'title' || row.kind === 'scripture'
  return (
    <>
      <div style={rowStyle({bold: false, italic: false, highlight: row.highlight})}>
        {/* The service's own Title/Text note reads as an aside to the label, so
            it sits on the same line. An Order Line's booth note is about the
            song under it and keeps its own line. */}
        <div>
          {renderInline(row.label)}
          {row.labelSuffix ? <span style={{fontWeight: 700, fontStyle: 'italic'}}> {row.labelSuffix}</span> : null}
          {row.note && inlineNote ? <span> {renderInline(row.note)}</span> : null}
        </div>
        {row.note && !inlineNote ? <div>{renderInline(row.note)}</div> : null}
      </div>
      {/* minWidth 0: a grid item's automatic minimum is its content, so without
          this a long unbroken title grows past the 1fr track instead of wrapping. */}
      <div style={{...rowStyle({bold: isSong, italic: false, highlight: false}), minWidth: 0}}>
        <div>{renderInline(row.value)}</div>
        {row.valueSecond ? (
          <div>
            {renderInline(row.valueSecond)}
            {row.suffix ? <span style={{fontWeight: 400}}> {renderInline(row.suffix)}</span> : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
