import {useCallback, useRef, useState} from 'react'

interface ProgressStage {
  message: string
  progress: number
}

interface ProgressState {
  message: string | null
  progress: number
  isRunning: boolean
  error: string | null
}

const initialState: ProgressState = {
  message: null,
  progress: 0,
  isRunning: false,
  error: null,
}

/**
 * Runs an async operation while showing staged progress messages.
 * Each stage advances after `intervalMs` (default 2s).
 */
export function useProgressOperation(stages: ProgressStage[], intervalMs = 2000) {
  const [state, setState] = useState<ProgressState>(initialState)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      clearTimer()
      let stageIndex = 0

      setState({
        message: stages[0]?.message ?? 'Processing\u2026',
        progress: stages[0]?.progress ?? 0,
        isRunning: true,
        error: null,
      })

      timerRef.current = setInterval(() => {
        stageIndex = Math.min(stageIndex + 1, stages.length - 1)
        setState((s) => ({
          ...s,
          message: stages[stageIndex].message,
          progress: stages[stageIndex].progress,
        }))
      }, intervalMs)

      try {
        const result = await operation()
        clearTimer()
        setState({message: null, progress: 100, isRunning: false, error: null})
        return result
      } catch (err) {
        clearTimer()
        const msg = err instanceof Error ? err.message : 'Operation failed'
        setState({message: null, progress: 0, isRunning: false, error: msg})
        throw err
      }
    },
    [stages, intervalMs],
  )

  const reset = useCallback(() => {
    clearTimer()
    setState(initialState)
  }, [])

  return {state, start, reset}
}
