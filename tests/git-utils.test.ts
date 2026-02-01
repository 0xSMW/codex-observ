import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeGitUrl,
  detectGitRemote,
  findGitRoot,
  FileSystem,
} from '../src/lib/ingestion/git-utils'

// Mock path.resolve
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path')
  return {
    ...actual,
    resolve: (...args: string[]) => args[0],
  }
})

function createMockFs(files: Record<string, string | boolean>): FileSystem {
  return {
    existsSync: (path: string) => {
      // Check exact match or directory match
      if (files[path] !== undefined) return true
      // Also return true if it's a directory containing files in our mock layout
      // e.g. /app/.git exists if files['/app/.git/config'] exists?
      // Simplified: explicit entries required for test
      return false
    },
    statSync: (path: string) => ({
      isDirectory: () => {
        // If it looks like a directory or ends with .git in our mock
        return path.endsWith('.git') || path.endsWith('/')
      },
    }),
    readFileSync: (path: string) => {
      const content = files[path]
      if (typeof content === 'string') return content
      throw new Error(`ENOENT: ${path}`)
    },
  }
}

describe('git-utils', () => {
  describe('normalizeGitUrl', () => {
    it('returns null for empty input', () => {
      expect(normalizeGitUrl(null)).toBeNull()
      expect(normalizeGitUrl('')).toBeNull()
    })

    it('normalizes standard HTTPS URLs', () => {
      expect(normalizeGitUrl('https://github.com/user/repo.git')).toBe(
        'https://github.com/user/repo'
      )
      expect(normalizeGitUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo')
      expect(normalizeGitUrl('https://github.com/user/repo/')).toBe('https://github.com/user/repo')
    })

    it('normalizes SSH URLs to HTTPS format', () => {
      expect(normalizeGitUrl('git@github.com:user/repo.git')).toBe('https://github.com/user/repo')
      expect(normalizeGitUrl('git@gitlab.com:org/group/project.git')).toBe(
        'https://gitlab.com/org/group/project'
      )
    })

    it('normalizes ssh:// scheme URLs', () => {
      expect(normalizeGitUrl('ssh://git@github.com/user/repo.git')).toBe(
        'https://github.com/user/repo'
      )
    })

    it('lowercases definitions', () => {
      expect(normalizeGitUrl('HTTPS://GITHUB.COM/USER/REPO.GIT')).toBe(
        'https://github.com/user/repo'
      )
    })
  })

  describe('findGitRoot', () => {
    it('finds .git in current directory', () => {
      const mockFs = createMockFs({
        '/app/.git': true, // .git directory exists
      })
      expect(findGitRoot('/app', mockFs)).toBe('/app')
    })

    it('walks up directory tree', () => {
      // Mock /app/.git exists
      // Calling from /app/src/lib
      const mockFs = createMockFs({
        '/app/.git': true,
      })

      const result = findGitRoot('/app/src/lib', mockFs)
      expect(result).toBe('/app')
    })

    it('returns null if root reached without .git', () => {
      const mockFs = createMockFs({})
      expect(findGitRoot('/app/src', mockFs)).toBeNull()
    })
  })

  describe('detectGitRemote', () => {
    it('returns remote from simplified config', () => {
      const mockConfig = `
[core]
	repositoryformatversion = 0
	filemode = true
[remote "origin"]
	url = git@github.com:example/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`
      const mockFs = createMockFs({
        '/app/.git': true,
        '/app/.git/config': mockConfig,
      })

      const remote = detectGitRemote('/app', mockFs)
      expect(remote).toBe('https://github.com/example/repo')
    })

    it('returns null if no remote origin', () => {
      const mockConfig = `
[core]
	repositoryformatversion = 0
`
      const mockFs = createMockFs({
        '/app/.git': true,
        '/app/.git/config': mockConfig,
      })
      expect(detectGitRemote('/app', mockFs)).toBeNull()
    })

    it('returns null if config file missing', () => {
      const mockFs = createMockFs({
        '/app/.git': true,
        // no config file
      })
      expect(detectGitRemote('/app', mockFs)).toBeNull()
    })
  })
})
