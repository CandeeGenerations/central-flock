import {describe, expect, it} from 'vitest'

import {
  STORY_LINE_LOCATORS,
  type StoryLineFields,
  TITLE_PAD,
  altText,
  buildOperations,
  titleText,
} from './canva-design.js'

const line = (n: number, line2: string | null = 'Dinner'): StoryLineFields => ({
  dayNumber: String(20 + n),
  month: 'Nov',
  dayTimeLine: 'Saturday @ 4 pm',
  line1: `Event ${n}`,
  line2,
})

describe('buildOperations', () => {
  it('writes day, month, day/time and title for all five Story Lines', () => {
    const ops = buildOperations([1, 2, 3, 4, 5].map((n) => line(n)))
    expect(ops).toHaveLength(20)
    expect(ops[0]).toEqual({type: 'replace_text', locator_id: STORY_LINE_LOCATORS[0].dayNumber, text: '21'})
    expect(ops[19]).toEqual({type: 'replace_text', locator_id: STORY_LINE_LOCATORS[4].title, text: 'Event 5\nDinner'})
    expect(new Set(ops.map((o) => o.locator_id)).size).toBe(20)
    expect(ops.every((o) => o.locator_id.startsWith('PBxpttyc19vjDJRB-'))).toBe(true)
  })

  it('refuses anything but five', () => {
    expect(() => buildOperations([line(1)])).toThrow(/exactly 5/)
  })
})

describe('titleText', () => {
  it('pads a one-line name so the title box stays two lines tall', () => {
    expect(titleText({line1: 'Holiday', line2: null})).toBe(`Holiday\n${TITLE_PAD}`)
    expect(titleText({line1: 'Holiday', line2: '  '})).toBe(`Holiday\n${TITLE_PAD}`)
    expect(titleText({line1: ' Church Family ', line2: 'Thanksgiving Dinner'})).toBe(
      'Church Family\nThanksgiving Dinner',
    )
  })
})

describe('altText', () => {
  it('lists the events', () => {
    expect(altText([line(1), line(2, null)])).toBe(
      'Upcoming events at Central Baptist Church. Saturday @ 4 pm, Nov 21: Event 1 Dinner. Saturday @ 4 pm, Nov 22: Event 2.',
    )
  })
})

describe('parseBestTimes', async () => {
  const {parseBestTimes} = await import('./metricool.js')
  const json = {
    data: [
      {dayOfWeek: 7, bestTimesByHour: [{hourOfDay: 18, value: 45}]},
      {
        dayOfWeek: 1,
        bestTimesByHour: [
          {hourOfDay: 10, value: 50},
          {hourOfDay: 13, value: 48},
        ],
      },
    ],
  }
  it('keeps only the requested weekday (2026-11-23 is a Monday)', () => {
    expect([...parseBestTimes(json, '2026-11-23')]).toEqual([
      [10, 50],
      [13, 48],
    ])
    expect([...parseBestTimes(json, '2026-11-22')]).toEqual([[18, 45]])
  })
  it('tolerates junk', () => {
    expect(parseBestTimes(null, '2026-11-23').size).toBe(0)
  })
})

describe('checkTitleBoxes', async () => {
  const {checkTitleBoxes, describeTitleProblems} = await import('./canva-design.js')
  // read-design nests each title inside its Story Line group.
  const entry = (i: number, height: number) => ({
    type: 'group',
    locator_id: 'PBxpttyc19vjDJRB-group',
    children: [{type: 'text', locator_id: STORY_LINE_LOCATORS[i].title, height}],
  })
  const read = (elements: unknown[]) => ({design_content: {pages: [{type: 'fixed', elements}]}})
  it('passes when every title box is two lines tall', () => {
    const check = checkTitleBoxes(read([0, 1, 2, 3, 4].map((i) => entry(i, 100.27))))
    expect(check).toEqual({oneLine: [], missing: []})
    expect(describeTitleProblems(check)).toBeNull()
  })
  it('flags one-line boxes (the Nov 16 design has one on Story Line 5)', () => {
    const check = checkTitleBoxes(read([0, 1, 2, 3].map((i) => entry(i, 100.27)).concat(entry(4, 46.27))))
    expect(check.oneLine).toEqual([5])
    expect(describeTitleProblems(check)).toMatch(/Story Line 5 has a one-line/)
  })
  it('flags missing elements', () => {
    expect(checkTitleBoxes(read([])).missing).toEqual([1, 2, 3, 4, 5])
  })
})

describe('storyPostInfo', async () => {
  const {storyPostInfo} = await import('./metricool.js')
  it('posts one Facebook + Instagram Story with no caption at the wall-clock time', () => {
    const info = storyPostInfo('https://x/story.png', 'alt', '2026-11-23', 10 * 60)
    expect(info).toMatchObject({
      autoPublish: true,
      draft: false,
      media: ['https://x/story.png'],
      mediaAltText: ['alt'],
      providers: [{network: 'facebook'}, {network: 'instagram'}],
      publicationDate: {dateTime: '2026-11-23T10:00:00', timezone: 'America/New_York'},
      text: '',
      facebookData: {type: 'STORY'},
      instagramData: {type: 'STORY'},
    })
  })
})
