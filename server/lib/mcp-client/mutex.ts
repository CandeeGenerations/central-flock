// Per-key serial lock. Refresh tokens are single-use (Canva rotates them), so two concurrent
// refreshes would burn the token and break the Connection — every refresh runs under this lock.

const tails = new Map<string, Promise<unknown>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => undefined)
  tails.set(key, tail)
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key)
  })
  return run
}
