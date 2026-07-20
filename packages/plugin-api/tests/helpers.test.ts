import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, retry, withTimeout } from '../src/helpers'

describe('retry', () => {
  it('resolves on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retry(fn, { times: 3, delayMs: 5 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('succeeds on retry after initial failure', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 2) return Promise.reject(new Error('fail'))
      return Promise.resolve('recovered')
    })
    const result = await retry(fn, { times: 3, delayMs: 5 })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('exhausts all attempts and throws last error', async () => {
    const err = new Error('always fails')
    const fn = vi.fn().mockRejectedValue(err)
    await expect(retry(fn, { times: 3, delayMs: 5 })).rejects.toThrow(
      'always fails'
    )
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws aborted error when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(
      retry(fn, { times: 3, delayMs: 5, signal: controller.signal })
    ).rejects.toThrow('aborted')
    expect(fn).not.toHaveBeenCalled()
  })

  it('aborts mid-retry when signal fires between attempts', async () => {
    const controller = new AbortController()
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls === 1) {
        // abort after first failure, before second attempt
        controller.abort()
        return Promise.reject(new Error('fail'))
      }
      return Promise.resolve('ok')
    })
    await expect(
      retry(fn, { times: 3, delayMs: 5, signal: controller.signal })
    ).rejects.toThrow('aborted')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('only fires the last call after delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced('a')
    debounced('b')
    debounced('c')

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('fires again after a second call following the debounce window', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced('first')
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('first')

    debounced('second')
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('does not fire before the delay elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('x')
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('withTimeout', () => {
  it('resolves when inner promise resolves in time', async () => {
    const p = Promise.resolve(42)
    const result = await withTimeout(p, 100)
    expect(result).toBe(42)
  })

  it('rejects with timeout error when inner exceeds ms', async () => {
    const p = new Promise<never>(() => {
      // never resolves
    })
    await expect(withTimeout(p, 10)).rejects.toThrow('timeout')
  })

  it('clears the timer on success (no dangling handle)', async () => {
    vi.useFakeTimers()
    try {
      const result = await withTimeout(Promise.resolve('done'), 1000)
      expect(result).toBe('done')
      // If timer wasn't cleared, this advance would trigger the race's losing
      // branch and surface as an unhandled rejection — vitest fails the test.
      expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})
