// packages/plugin-cli/src/find-motrix.ts
import { stat } from 'node:fs/promises'
import path from 'node:path'

export async function findMotrixBinary(): Promise<string | null> {
  // 1. Honor explicit env override.
  // Falsy MOTRIX_BIN (empty string or unset) falls through to platform probing.
  if (process.env.MOTRIX_BIN) {
    try {
      await stat(process.env.MOTRIX_BIN)
      return process.env.MOTRIX_BIN
    } catch {
      return null
    }
  }
  // 2. Platform-specific known locations
  if (process.platform === 'darwin') {
    for (const p of [
      '/Applications/Motrix.app/Contents/MacOS/Motrix',
      path.join(
        process.env.HOME ?? '',
        'Applications/Motrix.app/Contents/MacOS/Motrix'
      ),
    ]) {
      try {
        await stat(p)
        return p
      } catch {}
    }
  } else if (process.platform === 'win32') {
    for (const p of [
      'C:\\Program Files\\Motrix\\Motrix.exe',
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Programs',
        'Motrix',
        'Motrix.exe'
      ),
    ]) {
      try {
        await stat(p)
        return p
      } catch {}
    }
  } else if (process.platform === 'linux') {
    for (const p of [
      '/usr/bin/motrix',
      '/usr/local/bin/motrix',
      '/opt/Motrix/motrix',
    ]) {
      try {
        await stat(p)
        return p
      } catch {}
    }
  }
  // 3. Fall back to null — caller decides whether to shell out to `which`
  return null
}
