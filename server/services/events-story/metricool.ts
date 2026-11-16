import type {Client} from '@modelcontextprotocol/sdk/client/index.js'

import {withMcpClient} from '../../lib/mcp-client/client.js'
import {toolJson} from '../../lib/mcp-client/tool-result.js'
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
