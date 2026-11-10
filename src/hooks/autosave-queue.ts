export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface AutosaveQueueOptions<T> {
  save: (value: T) => Promise<unknown>
  delayMs?: number
  /** Automatic retries after a failed save, before it shows as an error. */
  retries?: number
  retryBaseMs?: number
  /** Combines a newer edit with one still waiting (patches); default: newest wins. */
  merge?: (older: T, newer: T) => T
  onChange?: (state: {status: AutosaveStatus; dirty: boolean}) => void
}

/**
 * The save discipline behind autosave, framework-free so it can be tested on its
 * own. One save in flight at a time; edits made meanwhile wait and go out
 * together after it, so an older response can never land on top of a newer
 * edit. "Saved" only once the server has answered.
 */
export class AutosaveQueue<T> {
  status: AutosaveStatus = 'idle'
  private pending: {value: T} | null = null
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private readonly delayMs: number
  private readonly retries: number
  private readonly retryBaseMs: number

  constructor(private opts: AutosaveQueueOptions<T>) {
    this.delayMs = opts.delayMs ?? 800
    this.retries = opts.retries ?? 3
    this.retryBaseMs = opts.retryBaseMs ?? 1000
  }

  get dirty(): boolean {
    return this.pending !== null || this.inFlight !== null
  }

  schedule(value: T, opts?: {immediate?: boolean}) {
    this.pending = this.pending && this.opts.merge ? {value: this.opts.merge(this.pending.value, value)} : {value}
    // A fresh edit is a fresh chance: retries count from it.
    if (this.status === 'error') this.attempts = 0
    this.setStatus('saving')
    this.clearTimer()
    if (opts?.immediate) this.kick()
    else this.timer = setTimeout(() => this.kick(), this.delayMs)
  }

  /** Save whatever is waiting now, and resolve once nothing is waiting or it has failed for good. */
  async flush(): Promise<void> {
    this.kick()
    while (this.inFlight || (this.pending && this.status !== 'error')) {
      if (this.inFlight) await this.inFlight
      else this.kick()
    }
  }

  retry() {
    this.attempts = 0
    this.kick()
  }

  dispose() {
    this.clearTimer()
  }

  private kick() {
    this.clearTimer()
    if (this.inFlight || !this.pending) return
    const {value} = this.pending
    this.pending = null
    this.setStatus('saving')
    this.inFlight = this.opts.save(value).then(
      () => {
        this.inFlight = null
        this.attempts = 0
        if (this.pending) this.kick()
        else this.setStatus('saved')
      },
      () => {
        this.inFlight = null
        // Keep the failed value, folded under anything typed since.
        this.pending = this.pending
          ? {value: this.opts.merge ? this.opts.merge(value, this.pending.value) : this.pending.value}
          : {value}
        this.attempts += 1
        if (this.attempts <= this.retries) {
          this.setStatus('saving')
          this.timer = setTimeout(() => this.kick(), this.retryBaseMs * 2 ** (this.attempts - 1))
        } else {
          this.setStatus('error')
        }
      },
    )
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private setStatus(status: AutosaveStatus) {
    this.status = status
    this.opts.onChange?.({status, dirty: this.dirty})
  }
}
