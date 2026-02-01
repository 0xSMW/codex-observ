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
 * Recursively finds the .git directory starting from the given path.
 * Returns the path to the directory containing .git, or null if not found.
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
      // console.log('Checking', gitDir) // Debug
      if (fileSystem.existsSync(gitDir) && fileSystem.statSync(gitDir).isDirectory()) {
        return current
      }

      const parent = path.dirname(current)
      if (parent === current) break // Reached root
      current = parent
    }
  } catch (err) {
    console.error('findGitRoot error:', err)
    // Ignore permissions errors etc and just return null
    return null
  }

  return null
}

/**
 * Detects the git remote origin URL for a given path by reading .git/config.
 * Only works if the file exists locally.
 */
export function detectGitRemote(cwd: string, fileSystem: FileSystem = defaultFs): string | null {
  const root = findGitRoot(cwd, fileSystem)
  if (!root) return null

  try {
    const configPath = path.join(root, '.git', 'config')
    if (!fileSystem.existsSync(configPath)) return null

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
