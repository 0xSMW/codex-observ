import fs from 'fs'
import path from 'path'
import ini from 'ini'

// Dependency injection interface for testing
export interface FileSystem {
  existsSync: (path: string) => boolean
  statSync: (path: string) => { isDirectory: () => boolean }
  readFileSync: (path: string, encoding: 'utf-8') => string
}

const defaultFs: FileSystem = {
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  readFileSync: (p, e) => fs.readFileSync(p, e),
}

/**
 * Normalizes a git remote URL to a standard format for comparison.
 * - Removes .git suffix
 * - Converts SSH (git@github.com:user/repo) to HTTPS (https://github.com/user/repo)
 * - Lowercases the result
 */
export function normalizeGitUrl(url: string | null): string | null {
  if (!url) return null

  let normalized = url.trim().toLowerCase()

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '')

  // Remove .git suffix
  if (normalized.endsWith('.git')) {
    normalized = normalized.slice(0, -4)
  }

  // Convert SSH to HTTPS
  // git@github.com:user/repo -> https://github.com/user/repo
  if (normalized.startsWith('git@')) {
    normalized = normalized.replace(':', '/').replace('git@', 'https://')
  }

  // Handle ssh://git@github.com/user/repo format
  if (normalized.startsWith('ssh://git@')) {
    normalized = normalized.replace('ssh://git@', 'https://')
  }

  return normalized
}

/**
 * Recursively finds the .git directory (or gitfile) starting from the given path.
 * Returns the path to the directory containing .git, or null if not found.
 * Supports both regular repos (.git is a directory) and worktrees/submodules (.git is a file with "gitdir: <path>").
 */
export function findGitRoot(startPath: string, fileSystem: FileSystem = defaultFs): string | null {
  if (!startPath) return null

  try {
    let current = path.resolve(startPath)
    // Safety check to avoid infinite loops or going above root
    const visited = new Set<string>()

    while (current && !visited.has(current)) {
      visited.add(current)

      const gitDir = path.join(current, '.git')
      if (!fileSystem.existsSync(gitDir)) {
        const parent = path.dirname(current)
        if (parent === current) break
        current = parent
        continue
      }

      // .git can be a directory (normal repo) or a file (worktree/submodule gitfile)
      if (fileSystem.statSync(gitDir).isDirectory()) {
        return current
      }
      // .git is a file -> gitfile (worktree or submodule); current is the repo root
      return current
    }
  } catch (err) {
    console.error('findGitRoot error:', err)
    // Ignore permissions errors etc and just return null
    return null
  }

  return null
}

/**
 * Resolves the path to the main repo config for a given git root.
 * If .git is a directory, returns root/.git/config.
 * If .git is a file (worktree gitfile), reads gitdir and commondir to get the shared config path.
 */
function getConfigPath(root: string, fileSystem: FileSystem): string | null {
  const gitPath = path.join(root, '.git')
  if (!fileSystem.existsSync(gitPath)) return null

  if (fileSystem.statSync(gitPath).isDirectory()) {
    const configPath = path.join(root, '.git', 'config')
    return fileSystem.existsSync(configPath) ? configPath : null
  }

  // .git is a file (gitfile) - worktree or submodule
  try {
    const content = fileSystem.readFileSync(gitPath, 'utf-8').trim()
    const match = content.match(/^gitdir:\s*(.+)$/m)
    if (!match) return null

    let gitDir = match[1].trim()
    if (!path.isAbsolute(gitDir)) {
      gitDir = path.resolve(root, gitDir)
    }

    // In a worktree, commondir points to the main .git (relative to gitDir)
    const commondirPath = path.join(gitDir, 'commondir')
    if (!fileSystem.existsSync(commondirPath)) return null

    const commondirContent = fileSystem.readFileSync(commondirPath, 'utf-8').trim()
    const commonDir = path.resolve(gitDir, commondirContent)
    const configPath = path.join(commonDir, 'config')
    return fileSystem.existsSync(configPath) ? configPath : null
  } catch {
    return null
  }
}

/**
 * Extracts the repository name from a git remote URL.
 * Examples:
 *   https://github.com/user/repo -> repo
 *   https://github.com/user/repo.git -> repo
 *   git@github.com:user/repo.git -> repo
 */
export function repoNameFromRemote(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null

  try {
    const normalized = normalizeGitUrl(remoteUrl)
    if (!normalized) return null

    // Extract the last path segment (repo name)
    const parts = normalized.split('/')
    const lastPart = parts[parts.length - 1]
    if (!lastPart) return null

    return lastPart
  } catch {
    return null
  }
}

/**
 * Detects the git remote origin URL for a given path by reading .git/config.
 * Only works if the file exists locally. Supports both normal repos and git worktrees.
 */
export function detectGitRemote(cwd: string, fileSystem: FileSystem = defaultFs): string | null {
  const root = findGitRoot(cwd, fileSystem)
  if (!root) return null

  try {
    const configPath = getConfigPath(root, fileSystem)
    if (!configPath) return null

    const configContent = fileSystem.readFileSync(configPath, 'utf-8')
    const config = ini.parse(configContent)

    // Look for [remote "origin"]
    // ini parser handles sections like 'remote "origin"'
    const origin = config['remote "origin"']
    if (origin && origin.url) {
      return normalizeGitUrl(origin.url)
    }

    // Fallback: iterate raw keys if ini parsing is weird about quotes
    for (const key of Object.keys(config)) {
      if (key.includes('remote') && key.includes('origin') && config[key].url) {
        return normalizeGitUrl(config[key].url)
      }
    }

    return null
  } catch (err) {
    // console.error('Error reading git config:', err)
    return null
  }
}
