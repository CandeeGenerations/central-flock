import {describe, expect, it} from 'vitest'

import {shouldReload} from './preload-recovery'

describe('shouldReload', () => {
  it('reloads when there has been no recent reload', () => {
    expect(shouldReload(1_000_000, null)).toBe(true)
  })

  it('does not reload again straight after a reload', () => {
    expect(shouldReload(1_005_000, 1_000_000)).toBe(false)
  })

  it('reloads again once the retry window has passed', () => {
    expect(shouldReload(1_011_000, 1_000_000)).toBe(true)
  })
})
