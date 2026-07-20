export async function retry<T>(
  fn: () => Promise<T>,
  opts: { times: number; delayMs: number; signal?: AbortSignal }
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < opts.times; i++) {
    if (opts.signal?.aborted) throw new Error('aborted')
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, opts.delayMs))
    }
  }
  throw lastErr
}

export function debounce<TArgs extends unknown[]>(
  fn: (...a: TArgs) => void,
  ms: number
): (...a: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: TArgs) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      timer = setTimeout(() => rej(new Error('timeout')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}
