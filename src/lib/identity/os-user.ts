import os from 'os'

export function getOsUsername(): string | null {
  try {
    const info = os.userInfo()
    if (info && typeof info.username === 'string' && info.username.trim()) {
      return info.username
    }
  } catch {
    return null
  }
  return null
}
