import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

// --- Path parsing -----------------------------------------------------------

export interface ParsedPath {
  // Section = path prefix before the first numeric segment (the nav target).
  section: string
  // Entity id = the first numeric segment, when present (e.g. /people/42 -> 42).
  entityId: number | null
}

// Strip query/hash, normalize trailing slash.
function normalize(path: string): string {
  const clean = path.split('#')[0].split('?')[0]
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1)
  return clean || '/'
}

export function parsePath(rawPath: string): ParsedPath {
  const path = normalize(rawPath)
  const segments = path.split('/').filter(Boolean)
  const idx = segments.findIndex((s) => /^\d+$/.test(s))
  if (idx === -1) return {section: path, entityId: null}
  const section = '/' + segments.slice(0, idx).join('/')
  return {section, entityId: Number(segments[idx])}
}

// --- Entity label resolution ------------------------------------------------

export interface ResolvedEntity {
  entityType: string
  typeLabel: string
  label: string
}

interface ResolverDef {
  entityType: string
  typeLabel: string
  resolveLabel: (id: number) => string | null
}

function get<T extends Record<string, unknown>>(row: T | undefined): T | undefined {
  return row
}

const RESOLVERS: Record<string, ResolverDef> = {
  '/people': {
    entityType: 'person',
    typeLabel: 'Person',
    resolveLabel: (id) => {
      const r = get(
        db
          .select({first: schema.people.firstName, last: schema.people.lastName})
          .from(schema.people)
          .where(eq(schema.people.id, id))
          .get(),
      )
      if (!r) return null
      return `${r.first ?? ''} ${r.last ?? ''}`.trim() || `#${id}`
    },
  },
  '/groups': {
    entityType: 'group',
    typeLabel: 'Group',
    resolveLabel: (id) =>
      get(db.select({name: schema.groups.name}).from(schema.groups).where(eq(schema.groups.id, id)).get())?.name ??
      null,
  },
  '/messages': {
    entityType: 'message',
    typeLabel: 'Message',
    resolveLabel: (id) => {
      const r = get(
        db
          .select({preview: schema.messages.renderedPreview, content: schema.messages.content})
          .from(schema.messages)
          .where(eq(schema.messages.id, id))
          .get(),
      )
      if (!r) return null
      return (r.preview || r.content || `#${id}`).slice(0, 60)
    },
  },
  '/templates': {
    entityType: 'template',
    typeLabel: 'Template',
    resolveLabel: (id) =>
      get(db.select({name: schema.templates.name}).from(schema.templates).where(eq(schema.templates.id, id)).get())
        ?.name ?? null,
  },
  '/devotions': {
    entityType: 'devotion',
    typeLabel: 'Devotion',
    resolveLabel: (id) => {
      const r = get(
        db
          .select({title: schema.devotions.title, number: schema.devotions.number})
          .from(schema.devotions)
          .where(eq(schema.devotions.id, id))
          .get(),
      )
      if (!r) return null
      return r.title?.trim() || `#${r.number}`
    },
  },
  '/devotions/passages': {
    entityType: 'passage',
    typeLabel: 'Passage',
    resolveLabel: (id) =>
      get(
        db
          .select({title: schema.generatedPassages.title})
          .from(schema.generatedPassages)
          .where(eq(schema.generatedPassages.id, id))
          .get(),
      )?.title ?? null,
  },
  '/devotions/gwendolyn': {
    entityType: 'gwendolyn_devotion',
    typeLabel: 'Gwendolyn Devotion',
    resolveLabel: (id) =>
      get(
        db
          .select({title: schema.gwendolynDevotions.title})
          .from(schema.gwendolynDevotions)
          .where(eq(schema.gwendolynDevotions.id, id))
          .get(),
      )?.title ?? null,
  },
  '/sermons/quotes': {
    entityType: 'quote',
    typeLabel: 'Quote',
    resolveLabel: (id) =>
      get(db.select({title: schema.quotes.title}).from(schema.quotes).where(eq(schema.quotes.id, id)).get())?.title ??
      null,
  },
  '/music/specials': {
    entityType: 'special',
    typeLabel: 'Special',
    resolveLabel: (id) =>
      get(
        db
          .select({title: schema.specialMusic.songTitle})
          .from(schema.specialMusic)
          .where(eq(schema.specialMusic.id, id))
          .get(),
      )?.title ?? null,
  },
  '/music/hymns/searches': {
    entityType: 'hymn_search',
    typeLabel: 'Hymn Search',
    resolveLabel: (id) =>
      get(
        db
          .select({title: schema.hymnSearches.title})
          .from(schema.hymnSearches)
          .where(eq(schema.hymnSearches.id, id))
          .get(),
      )?.title ?? null,
  },
  '/special-music': {
    entityType: 'special_music_schedule',
    typeLabel: 'Special Music',
    resolveLabel: (id) => resolveScheduleLabel(id),
  },
  '/nursery': {
    entityType: 'nursery_schedule',
    typeLabel: 'Nursery',
    resolveLabel: (id) => resolveScheduleLabel(id),
  },
  '/schedules/fair-booth': {
    entityType: 'fair_booth_schedule',
    typeLabel: 'Fair Booth',
    resolveLabel: (id) => resolveScheduleLabel(id),
  },
  '/rsvp': {
    entityType: 'rsvp_list',
    typeLabel: 'RSVP List',
    resolveLabel: (id) =>
      get(db.select({name: schema.rsvpLists.name}).from(schema.rsvpLists).where(eq(schema.rsvpLists.id, id)).get())
        ?.name ?? null,
  },
}

function resolveScheduleLabel(id: number): string | null {
  return (
    get(db.select({label: schema.schedules.scopeLabel}).from(schema.schedules).where(eq(schema.schedules.id, id)).get())
      ?.label ?? null
  )
}

export function hasResolver(section: string): boolean {
  return section in RESOLVERS
}

// "/schedules/fair-booth" -> "Fair Booth"
function humanizeSection(section: string): string {
  const last = section.split('/').filter(Boolean).pop() ?? section
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const warnedSections = new Set<string>()

// Resolve a visited entity path to a display label. Registered types get a live,
// pretty label (null if the row no longer exists -> caller drops it). Unregistered
// entity sections degrade to a generic-but-functional label so new routes work
// with zero config; a one-time dev warning surfaces the missing resolver.
export function resolveEntity(section: string, id: number): ResolvedEntity | null {
  const def = RESOLVERS[section]
  if (def) {
    const label = def.resolveLabel(id)
    if (label == null) return null // deleted entity
    return {entityType: def.entityType, typeLabel: def.typeLabel, label}
  }
  if (process.env.NODE_ENV !== 'production' && !warnedSections.has(section)) {
    warnedSections.add(section)
    console.warn(
      `[usage] no entity resolver for section "${section}" — using generic label. Add one to usage-entity-resolver.ts`,
    )
  }
  const typeLabel = humanizeSection(section)
  return {entityType: section, typeLabel, label: `${typeLabel} #${id}`}
}
