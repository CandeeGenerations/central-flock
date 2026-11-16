import type {Client} from '@modelcontextprotocol/sdk/client/index.js'

import {withMcpClient} from '../../lib/mcp-client/client.js'
import {findKey, toolJson} from '../../lib/mcp-client/tool-result.js'
import {addDays, weekdayOf} from '../../lib/repeat-rules.js'
import {type HourScores, STORY_TIMEZONE, zonedIso} from './post-time.js'

export const METRICOOL_BRAND_ID = '2350437' // Central Baptist Church
export const STORY_NETWORKS = ['facebook', 'instagram'] as const

interface BestTimesResponse {
  data?: {dayOfWeek: number; bestTimesByHour: {hourOfDay: number; value: number}[]}[]
}

// Metricool returns hours keyed by ISO weekday (1 = Monday … 7 = Sunday) and local hour. Its
// window is skewed (asking for Monday returns Sunday evening + Monday 0–17), so callers ask for
// the day either side and this keeps only the requested weekday.
export function parseBestTimes(json: unknown, date: string): HourScores {
  const isoWeekday = weekdayOf(date) === 0 ? 7 : weekdayOf(date)
  const scores: HourScores = new Map()
  for (const day of (json as BestTimesResponse)?.data ?? []) {
    if (day.dayOfWeek !== isoWeekday) continue
    for (const {hourOfDay, value} of day.bestTimesByHour ?? []) {
      if (Number.isInteger(hourOfDay) && typeof value === 'number') scores.set(hourOfDay, value)
    }
  }
  return scores
}

async function bestTimesFor(client: Client, date: string, network: string): Promise<HourScores> {
  const result = await client.callTool({
    name: 'getBestTimeToPostByNetwork',
    arguments: {
      brandId: METRICOOL_BRAND_ID,
      fromDate: zonedIso(addDays(date, -1), 0),
      toDate: zonedIso(addDays(date, 1), 23, 59),
      timezone: STORY_TIMEZONE,
      socialNetwork: network,
    },
  })
  return parseBestTimes(toolJson(result), date)
}

// Facebook and Instagram best-time scores for one day.
export function fetchBestTimes(date: string): Promise<HourScores[]> {
  return withMcpClient('metricool', async (client) => {
    const out: HourScores[] = []
    for (const network of STORY_NETWORKS) out.push(await bestTimesFor(client, date, network))
    return out
  })
}

// Wall-clock "YYYY-MM-DDTHH:mm:ss" for Metricool's publicationDate.
function localDateTime(date: string, minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  return `${date}T${hh}:${mm}:00`
}

// The `info` payload for one Facebook + Instagram Story post. Stories carry no caption.
export function storyPostInfo(imageUrl: string, altText: string, date: string, minute: number) {
  return {
    autoPublish: true,
    draft: false,
    descendants: [],
    firstCommentText: '',
    hasNotReadNotes: false,
    media: [imageUrl],
    mediaAltText: [altText],
    providers: STORY_NETWORKS.map((network) => ({network})),
    publicationDate: {dateTime: localDateTime(date, minute), timezone: STORY_TIMEZONE},
    shortener: false,
    smartLinkData: {ids: []},
    text: '',
    facebookData: {type: 'STORY'},
    instagramData: {type: 'STORY'},
  }
}

export interface ScheduledPost {
  id: string | null
  plannerUrl: string | null
}

// Schedules the exported PNG as a Facebook + Instagram Story. Metricool keeps its own copy of the
// image, so the short-lived Canva export URL is fine to hand over.
export function scheduleStory(imageUrl: string, altText: string, date: string, minute: number): Promise<ScheduledPost> {
  return withMcpClient('metricool', async (client) => {
    const result = toolJson(
      await client.callTool({
        name: 'createScheduledPost',
        arguments: {
          date: zonedIso(date, Math.floor(minute / 60), minute % 60),
          blogId: METRICOOL_BRAND_ID,
          info: JSON.stringify(storyPostInfo(imageUrl, altText, date, minute)),
        },
      }),
    )
    const id = findKey<string | number>(result, 'id')
    const plannerUrl = findKey<string>(result, 'plannerUrl')
    return {id: id === undefined ? null : String(id), plannerUrl: plannerUrl ?? null}
  })
}
