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
