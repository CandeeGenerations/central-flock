/** Least-squares slope/intercept over y indexed 0..n-1. */
export function linreg(y: number[]): {slope: number; intercept: number} {
  const n = y.length
  if (n < 2) return {slope: 0, intercept: y[0] ?? 0}
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0
  for (let i = 0; i < n; i++) {
    sx += i
    sy += y[i]
    sxy += i * y[i]
    sxx += i * i
  }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return {slope, intercept}
}

/**
 * The percentage change the fitted trend line covers across the range, and
 * which way it points — what the dashboards print beside the chart title.
 */
export function trendDelta(y: number[]): {pct: number; up: boolean; count: number} {
  const {slope, intercept} = linreg(y)
  const start = intercept
  const end = intercept + slope * Math.max(0, y.length - 1)
  const pct = start > 0 ? Math.round(((end - start) / start) * 100) : 0
  return {pct, up: end >= start, count: y.length}
}
