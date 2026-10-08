import {describe, expect, it} from 'vitest'

import {parseGeneration} from './sermon-social.js'

const transcript = 'Good morning. Grace is not a reward for the good; it is a rescue for the lost. Amen.'

describe('sermon-social parseGeneration', () => {
  it('parses big idea, scriptures, located quotes and reflections', () => {
    const text = `<bigIdea>Grace rescues.</bigIdea>
<scripture reference="Ephesians 2:8" book="Ephesians" chapter="2" />
<scripture reference="Ephesians 2:8" book="Ephesians" chapter="2" />
<quote tier="high">
  <verbatim>Grace is not a reward for the good; it is a rescue for the lost.</verbatim>
  <cleaned>Grace is not a reward for the good; it is a rescue for the lost.</cleaned>
</quote>
<quote tier="low"><verbatim>Words he never said.</verbatim></quote>
<reflection tier="medium"><body>Who needs rescuing this week?</body></reflection>`
    const gen = parseGeneration(text, transcript)
    expect(gen.bigIdea).toBe('Grace rescues.')
    expect(gen.scriptures).toHaveLength(1)
    expect(gen.quotes).toHaveLength(1)
    const {startOffset, endOffset} = gen.quotes[0]
    expect(transcript.slice(startOffset ?? 0, endOffset ?? 0)).toBe(
      'Grace is not a reward for the good; it is a rescue for the lost.',
    )
    expect(gen.skippedQuotes).toBe(1)
    expect(gen.reflections[0]).toMatchObject({body: 'Who needs rescuing this week?', rankTier: 'medium'})
  })
})
