/**
 * Normalizes a git remote URL for use as a merge key (same repo = same key).
 * Lowercases, strips .git and trailing slashes, converts SSH to HTTPS.
 */
export function normalizeGitUrlForMerge(url: string | null): string | null {
  if (!url || !url.trim()) return null
  let n = url.trim().toLowerCase().replace(/\/+$/, '')
  if (n.endsWith('.git')) n = n.slice(0, -4)
  if (n.startsWith('git@')) n = n.replace(':', '/').replace('git@', 'https://')
  if (n.startsWith('ssh://git@')) n = n.replace('ssh://git@', 'https://')
  return n || null
}

/**
 * Extracts the repo name (last path segment) from a git remote URL.
 * Used to match projects by canonical name when some rows have remote and others don't.
 */
export function repoNameFromRemoteUrl(url: string | null): string | null {
  const normalized = normalizeGitUrlForMerge(url)
  if (!normalized) return null
  try {
    const u = new URL(normalized)
    const segment = u.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .pop()
    return segment?.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Returns a short display label for a git remote URL (e.g. "owner/repo" for GitHub).
 * Used to show the actual GitHub/GitLab project instead of the folder name.
 */
export function formatGitRemoteDisplay(url: string | null): string | null {
  if (!url || !url.trim()) return null
  try {
    const u = new URL(url.trim())
    const path = u.pathname.replace(/^\/+/, '').replace(/\.git$/i, '')
    return path || null
  } catch {
    return null
  }
}
