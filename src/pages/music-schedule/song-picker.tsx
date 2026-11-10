import type {HymnBook} from '@/lib/music-schedule-core'

/** A song as the editor holds it. Typed in with SongInput (components/music-schedule/song-input). */
export interface SongValue {
  hymnId: number | null
  hymnBook: HymnBook | null
  hymnNumber: number | null
  hymnTitle: string | null
  freeSongTitle: string | null
  /** The printed wording, when it differs from the hymnal's. */
  text: string
}
