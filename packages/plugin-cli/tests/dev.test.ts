// packages/plugin-cli/tests/dev.test.ts

import { closeSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findMotrixBinary } from '../src/find-motrix'

// Probe whether the current machine has Motrix installed at any of the
// canonical paths that find-motrix.ts checks. If so, the two "no-Motrix"
// tests below would assert null but find a real binary — skip them locally
// rather than weaken the assertion to a tautology. CI environments never
// have these paths populated, so those tests still run there.
const PLATFORM_PATHS: string[] =
  process.platform === 'darwin'
    ? [
        '/Applications/Motrix.app/Contents/MacOS/Motrix',
        path.join(
          process.env.HOME ?? '',
          'Applications/Motrix.app/Contents/MacOS/Motrix'
        ),
      ]
    : process.platform === 'win32'
      ? [
          'C:\\Program Files\\Motrix\\Motrix.exe',
          path.join(
            process.env.LOCALAPPDATA ?? '',
            'Programs',
            'Motrix',
            'Motrix.exe'
          ),
        ]
      : ['/usr/bin/motrix', '/usr/local/bin/motrix', '/opt/Motrix/motrix']

const platformBinaryPresent = PLATFORM_PATHS.some((p) => {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
})

describe('findMotrixBinary', () => {
  let savedMotrixBin: string | undefined

  beforeEach(() => {
    savedMotrixBin = process.env.MOTRIX_BIN
  })

  afterEach(() => {
    if (savedMotrixBin === undefined) {
      delete process.env.MOTRIX_BIN
    } else {
      process.env.MOTRIX_BIN = savedMotrixBin
    }
  })

  it('returns null when MOTRIX_BIN points to a non-existent file', async () => {
    process.env.MOTRIX_BIN = '/nonexistent/path/to/motrix'
    const result = await findMotrixBinary()
    expect(result).toBeNull()
  })

  it('returns the path when MOTRIX_BIN points to an existing file', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'find-motrix-'))
    const fakeBin = path.join(tmpDir, 'motrix')
    // Create a zero-byte file to simulate an existing binary
    closeSync(openSync(fakeBin, 'w'))
    try {
      process.env.MOTRIX_BIN = fakeBin
      const result = await findMotrixBinary()
      expect(result).toBe(fakeBin)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it.skipIf(platformBinaryPresent)(
    'returns null when MOTRIX_BIN is unset and platform defaults are absent',
    async () => {
      delete process.env.MOTRIX_BIN
      const result = await findMotrixBinary()
      expect(result).toBeNull()
    }
  )

  it.skipIf(platformBinaryPresent)(
    'returns null when MOTRIX_BIN is set to an empty string',
    async () => {
      // Empty string is falsy — the env-override branch is skipped, the
      // function falls through to platform probing.
      process.env.MOTRIX_BIN = ''
      const result = await findMotrixBinary()
      expect(result).toBeNull()
    }
  )
})
