import type {StoryLineText} from './story-lines.js'

// Everything specific to the "Upcoming events" Canva design. If the template is redesigned, the
// locators here are what changes (ADR 0042).

export const DESIGN_ID = 'DAHXGTKcnks'
export const PAGE_ID = 'PBxpttyc19vjDJRB'
export const STORY_LINE_COUNT = 5

// Every title box is kept two lines tall, which is what holds each Story Line's divider in place.
// Canva moves a divider ±54px when its title box changes between one and two lines, and Canva's
// Connect MCP has no operation that can move a line back (no update_line_properties). So a
// one-line name gets an invisible second line: a non-breaking space. (U+2800 renders a glyph.)
export const TITLE_PAD = ' '

interface StoryLineLocators {
  dayNumber: string
  month: string
  dayTimeLine: string
  title: string
}

const loc = (group: string, element: string) => `${PAGE_ID}-${group}-${element}`

export const STORY_LINE_LOCATORS: StoryLineLocators[] = [
  {
    dayNumber: loc('LBQltt7CDBJNqpJm', 'LB46LS8D8stGBGkV'),
    month: loc('LBQltt7CDBJNqpJm', 'LB3MqDfhzGZJZfjL'),
    dayTimeLine: loc('LBDB7Ky39gRFfvh0', 'LB5VyqfSkQlJy1mb'),
    title: loc('LBDB7Ky39gRFfvh0', 'LBqyMVc8X5wBtC53'),
  },
  {
    dayNumber: loc('LBLN8nKVhLxkfPZq', 'LB2nVF0DsVDzG1SY'),
    month: loc('LBLN8nKVhLxkfPZq', 'LBX0c2NRrLxQz2ZP'),
    dayTimeLine: loc('LBFYmLGKJCtpX7Sr', 'LBM3DqZTzkbLRVWn'),
    title: loc('LBFYmLGKJCtpX7Sr', 'LBr4dzT0YbW9Ycz7'),
  },
  {
    dayNumber: loc('LBYhG58Wn3x6hFWx', 'LB307TX5THqZm8GM'),
    month: loc('LBYhG58Wn3x6hFWx', 'LB4QbMZKPrWHvfpg'),
    dayTimeLine: loc('LBrDff7rYPXfjzKP', 'LB131TdbzG7fK3cF'),
    title: loc('LBrDff7rYPXfjzKP', 'LB91vZ524nGY2BWl'),
  },
  {
    dayNumber: loc('LByTnl51npX4B0lw', 'LBxzq9s4H7TgsNh5'),
    month: loc('LByTnl51npX4B0lw', 'LBpDwxJHsCsJv0wt'),
    dayTimeLine: loc('LBr1bH6hLQtmXRkQ', 'LBmWQF4BYpvC34mL'),
    title: loc('LBr1bH6hLQtmXRkQ', 'LBdBzVlSTYcp3kMn'),
  },
  {
    dayNumber: loc('LBTdQY4Dxz0MjHzL', 'LBPwsxzlGpVbGyNs'),
    month: loc('LBTdQY4Dxz0MjHzL', 'LBpyPMSs4MMZ0llj'),
    dayTimeLine: loc('LBRTht7TGy6CHyfH', 'LBFtRqtntX73tQ0c'),
    title: loc('LBRTht7TGy6CHyfH', 'LBSYFr7fbsZb9zsT'),
  },
]

export type StoryLineFields = Pick<StoryLineText, 'dayNumber' | 'month' | 'dayTimeLine' | 'line1' | 'line2'>

export function titleText(line: Pick<StoryLineText, 'line1' | 'line2'>): string {
  const second = line.line2?.trim()
  return `${line.line1.trim()}\n${second || TITLE_PAD}`
}

export interface ReplaceTextOperation {
  type: 'replace_text'
  element_id: string
  text: string
}

// The perform-editing-operations payload that fills all five Story Lines.
export function buildOperations(lines: StoryLineFields[]): ReplaceTextOperation[] {
  if (lines.length !== STORY_LINE_COUNT) throw new Error(`An Events Story needs exactly ${STORY_LINE_COUNT} events`)
  return lines.flatMap((line, i) => {
    const l = STORY_LINE_LOCATORS[i]
    return [
      {type: 'replace_text' as const, element_id: l.dayNumber, text: line.dayNumber.trim()},
      {type: 'replace_text' as const, element_id: l.month, text: line.month.trim()},
      {type: 'replace_text' as const, element_id: l.dayTimeLine, text: line.dayTimeLine.trim()},
      {type: 'replace_text' as const, element_id: l.title, text: titleText(line)},
    ]
  })
}

// Alt text for the posted Story: one line per event.
export function altText(lines: StoryLineFields[]): string {
  const items = lines.map((l) => {
    const name = [l.line1, l.line2].filter(Boolean).join(' ')
    return `${l.dayTimeLine}, ${l.month} ${l.dayNumber}: ${name}`
  })
  return `Upcoming events at Central Baptist Church. ${items.join('. ')}.`
}

// ---------- pre-edit check ----------

const TWO_LINE_MIN_HEIGHT = 70 // one line ≈ 46px, two lines ≈ 100px

interface RichTextEntry {
  element_id?: string
  containerElement?: {dimension?: {height?: number}}
}

export interface TitleBoxCheck {
  oneLine: number[] // Story Lines (1-based) whose title box is one line tall
  missing: number[] // Story Lines whose title element isn't in the design any more
}

// Reads start-editing-transaction's `richtexts`. A one-line title box would make its divider jump
// when we write two lines (see TITLE_PAD); a missing one means the template was redesigned.
export function checkTitleBoxes(transaction: unknown): TitleBoxCheck {
  const richtexts = ((transaction as {richtexts?: RichTextEntry[]})?.richtexts ?? []) as RichTextEntry[]
  const out: TitleBoxCheck = {oneLine: [], missing: []}
  STORY_LINE_LOCATORS.forEach((l, i) => {
    const entry = richtexts.find((r) => r.element_id === l.title)
    const height = entry?.containerElement?.dimension?.height
    if (typeof height !== 'number') out.missing.push(i + 1)
    else if (height < TWO_LINE_MIN_HEIGHT) out.oneLine.push(i + 1)
  })
  return out
}

export function describeTitleProblems({oneLine, missing}: TitleBoxCheck): string | null {
  if (missing.length > 0) {
    return `Story Line ${missing.join(', ')} wasn't found in the Canva design — has the template changed? (ADR 0042)`
  }
  if (oneLine.length > 0) {
    return (
      `Story Line ${oneLine.join(', ')} has a one-line title box in Canva, so its divider would move. ` +
      'Give it a blank second line in Canva (and put the divider back in line) before running again.'
    )
  }
  return null
}
