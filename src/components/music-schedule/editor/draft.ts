import type {LineInput} from '@/lib/music-schedule-api'
import type {MusicLineRole, OrderLine} from '@/lib/music-schedule-core'
import type {SongValue} from '@/pages/music-schedule/song-picker'

/** An Order Line as the editor holds it — `key` is stable across saves and drags. */
export type Draft = OrderLine & {key: string}

let counter = 0
export const newKey = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`

export function emptyLine(kind: OrderLine['kind'], role: MusicLineRole): Draft {
  return {
    id: -1,
    key: newKey(),
    kind,
    role,
    hymnId: null,
    hymnBook: null,
    hymnNumber: null,
    hymnTitle: null,
    freeSongTitle: null,
    suffix: '',
    leftText: '',
    text: '',
    merged: null,
    align: null,
    bold: null,
    italic: false,
    highlight: false,
    boothHighlight: false,
    sticky: false,
    booth: 'auto',
    boothLabel: '',
    boothNote: '',
    sortOrder: 0,
  }
}

export function toInput(l: OrderLine): LineInput {
  return {
    kind: l.kind,
    role: l.role,
    hymnId: l.hymnId,
    freeSongTitle: l.freeSongTitle,
    suffix: l.suffix,
    leftText: l.leftText,
    text: l.text,
    merged: l.merged,
    align: l.align,
    bold: l.bold,
    italic: l.italic,
    highlight: l.highlight,
    boothHighlight: l.boothHighlight,
    sticky: l.sticky,
    booth: l.booth,
    boothLabel: l.boothLabel,
    boothNote: l.boothNote,
  }
}

export function songValueOf(l: OrderLine): SongValue {
  return {
    hymnId: l.hymnId,
    hymnBook: l.hymnBook,
    hymnNumber: l.hymnNumber,
    hymnTitle: l.hymnTitle,
    freeSongTitle: l.freeSongTitle,
    text: l.text,
  }
}

/** A change to a line, and whether it should save now rather than after typing stops. */
export type LineChange = (patch: Partial<Draft>, opts?: {immediate?: boolean}) => void
