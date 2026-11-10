import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AutosaveQueue} from './autosave-queue'

function deferred() {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('AutosaveQueue', () => {
  it('debounces typing into one save with the latest value', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const q = new AutosaveQueue<string>({save, delayMs: 800})
    q.schedule('a')
    q.schedule('ab')
    q.schedule('abc')
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('abc')
    expect(q.status).toBe('saved')
    expect(q.dirty).toBe(false)
  })

  it('never runs two saves at once, and sends edits made meanwhile after it', async () => {
    const first = deferred()
    const calls: string[] = []
    const save = vi.fn((v: string) => {
      calls.push(v)
      return calls.length === 1 ? first.promise : Promise.resolve()
    })
    const q = new AutosaveQueue<string>({save})
    q.schedule('one', {immediate: true})
    q.schedule('two', {immediate: true})
    q.schedule('three', {immediate: true})
    expect(calls).toEqual(['one'])
    expect(q.status).toBe('saving')
    first.resolve()
    await vi.runAllTimersAsync()
    // The slow first save finished first; only the newest edit follows it.
    expect(calls).toEqual(['one', 'three'])
    expect(q.status).toBe('saved')
  })

  it('merges patches that wait together', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const q = new AutosaveQueue<Record<string, string>>({save, merge: (a, b) => ({...a, ...b})})
    q.schedule({title: 'T'})
    q.schedule({scripture: 'Psalm 1'})
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledWith({title: 'T', scripture: 'Psalm 1'})
  })

  it('retries a failed save and succeeds', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined)
    const q = new AutosaveQueue<string>({save, retryBaseMs: 1000})
    q.schedule('x', {immediate: true})
    await vi.advanceTimersByTimeAsync(0)
    expect(q.status).toBe('saving')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(q.status).toBe('saved')
  })

  it('shows an error after the retries run out, and keeps the value for Retry', async () => {
    const save = vi.fn().mockRejectedValue(new Error('down'))
    const q = new AutosaveQueue<string>({save, retries: 3, retryBaseMs: 10})
    q.schedule('x', {immediate: true})
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(4)
    expect(q.status).toBe('error')
    expect(q.dirty).toBe(true)

    save.mockResolvedValueOnce(undefined)
    q.retry()
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenLastCalledWith('x')
    expect(q.status).toBe('saved')
  })

  it('flush sends a waiting edit at once and resolves when it lands', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const q = new AutosaveQueue<string>({save, delayMs: 800})
    q.schedule('typed')
    await q.flush()
    expect(save).toHaveBeenCalledWith('typed')
    expect(q.status).toBe('saved')
    expect(q.dirty).toBe(false)
  })

  it('flush gives up once the save has failed for good', async () => {
    const save = vi.fn().mockRejectedValue(new Error('down'))
    const q = new AutosaveQueue<string>({save, retries: 1, retryBaseMs: 10})
    q.schedule('typed')
    const done = q.flush()
    await vi.runAllTimersAsync()
    await done
    expect(q.status).toBe('error')
  })
})
