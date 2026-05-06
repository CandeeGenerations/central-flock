import type {SearchProvider} from '@/lib/search/registry'

import {calendarProvider} from './calendar'
import {devotionsProvider} from './devotions'
import {draftsProvider} from './drafts'
import {groupsProvider} from './groups'
import {gwendolynDevotionsProvider} from './gwendolyn-devotions'
import {hymnsProvider} from './hymns'
import {messagesProvider} from './messages'
import {nurserySchedulesProvider} from './nursery-schedules'
import {peopleProvider} from './people'
import {quotesProvider} from './quotes'
import {rsvpProvider} from './rsvp'
import {templatesProvider} from './templates'

export const providers: SearchProvider[] = [
  peopleProvider as SearchProvider,
  groupsProvider as SearchProvider,
  devotionsProvider as SearchProvider,
  messagesProvider as SearchProvider,
  quotesProvider as SearchProvider,
  templatesProvider as SearchProvider,
  hymnsProvider as SearchProvider,
  draftsProvider as SearchProvider,
  gwendolynDevotionsProvider as SearchProvider,
  nurserySchedulesProvider as SearchProvider,
  calendarProvider as SearchProvider,
  rsvpProvider as SearchProvider,
]
