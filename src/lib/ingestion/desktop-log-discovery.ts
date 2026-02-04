import fs from 'fs'
import os from 'os'
import path from 'path'

function resolveDefaultRoot(): string | null {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Logs', 'com.openai.codex')
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    return localAppData ? path.join(localAppData, 'Codex', 'Logs') : null
  }
  const stateHome = process.env.XDG_STATE_HOME || path.join(home, '.local', 'state')
  return path.join(stateHome, 'codex', 'logs')
}

export function resolveDesktopLogRoots(): string[] {
  const override = process.env.CODEX_OBSERV_DESKTOP_LOG_DIR
  if (override && override.trim().length > 0) {
    return override
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  const root = resolveDefaultRoot()
  return root ? [root] : []
}

async function walkDir(
  dir: string,
  onFile: (filePath: string, stat: fs.Stats) => void
): Promise<void> {
  let entries: fs.Dirent[] = []
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkDir(fullPath, onFile)
        return
      }
      if (!entry.isFile()) {
        return
      }
      if (!isDesktopLogFile(entry.name)) {
        return
      }
      const stat = await fs.promises.stat(fullPath).catch(() => null)
      if (stat) {
        onFile(fullPath, stat)
      }
    })
  )
}

function isDesktopLogFile(name: string): boolean {
  return name.startsWith('codex-desktop-') && name.endsWith('.log')
}

export async function discoverDesktopLogFiles(): Promise<string[]> {
  const roots = resolveDesktopLogRoots()
  if (roots.length === 0) {
    return []
  }

  const found: Array<{ path: string; mtimeMs: number }> = []

  for (const root of roots) {
    let stat: fs.Stats | null = null
    try {
      stat = await fs.promises.stat(root)
    } catch {
      continue
    }
    if (!stat.isDirectory()) {
      continue
    }

    await walkDir(root, (filePath, fileStat) => {
      found.push({ path: filePath, mtimeMs: fileStat.mtimeMs })
    })
  }

  found.sort((a, b) => a.mtimeMs - b.mtimeMs)
  return found.map((entry) => entry.path)
}
