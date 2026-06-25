import type {SearchProvider} from '@/lib/search/registry'

import {calendarProvider} from './calendar'
import {devotionPassagesProvider} from './devotion-passages'
import {devotionsProvider} from './devotions'
import {draftsProvider} from './drafts'
import {fairBoothSchedulesProvider} from './fair-booth-schedules'
import {groupsProvider} from './groups'
import {gwendolynDevotionsProvider} from './gwendolyn-devotions'
import {hymnsProvider} from './hymns'
import {messagesProvider} from './messages'
import {nurserySchedulesProvider} from './nursery-schedules'
import {peopleProvider} from './people'
import {quotesProvider} from './quotes'
import {recentsProvider} from './recents'
import {rsvpProvider} from './rsvp'
import {specialMusicSchedulesProvider} from './special-music-schedules'
import {specialsProvider} from './specials'
import {templatesProvider} from './templates'

// Recents always loads (it shows on the empty palette). The entity providers
// populate the searchable index; their results only surface once you type
// (see command-palette.tsx empty-state curation).
export const providers: SearchProvider[] = [
  recentsProvider as SearchProvider,
  peopleProvider as SearchProvider,
  groupsProvider as SearchProvider,
  devotionsProvider as SearchProvider,
  devotionPassagesProvider as SearchProvider,
  fairBoothSchedulesProvider as SearchProvider,
  messagesProvider as SearchProvider,
  quotesProvider as SearchProvider,
  templatesProvider as SearchProvider,
  hymnsProvider as SearchProvider,
  draftsProvider as SearchProvider,
  gwendolynDevotionsProvider as SearchProvider,
  nurserySchedulesProvider as SearchProvider,
  specialMusicSchedulesProvider as SearchProvider,
  calendarProvider as SearchProvider,
  rsvpProvider as SearchProvider,
  specialsProvider as SearchProvider,
]
