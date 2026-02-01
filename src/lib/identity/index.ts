import path from 'path'
import os from 'os'
import { getOsUsername } from './os-user'
import { parseAuthIdentity, type AuthIdentity } from './auth-parser'

export interface UserIdentity {
  username: string
  source: 'os' | 'auth'
  provider?: string | null
  email_domain?: string | null
  email_hash?: string | null
}

export interface TerminalInfo {
  type: string
  program: string | null
}

export function resolveUserIdentity(codexHome?: string): UserIdentity {
  const osUser = getOsUsername()
  if (osUser) {
    return {
      username: osUser,
      source: 'os',
    }
  }

  const auth = parseAuthIdentity(codexHome ?? path.join(os.homedir(), '.codex'))
  if (auth) {
    return {
      username: formatAuthUsername(auth),
      source: 'auth',
      provider: auth.provider,
      email_domain: auth.email_domain,
      email_hash: auth.email_hash,
    }
  }

  return {
    username: 'unknown',
    source: 'os',
  }
}

export function detectTerminalType(): TerminalInfo {
  const term = process.env.TERM || 'unknown'
  const program = process.env.TERM_PROGRAM || process.env.TERMINAL_EMULATOR || null
  return { type: term, program }
}

function formatAuthUsername(auth: AuthIdentity): string {
  if (auth.email_hash && auth.email_domain) {
    return `${auth.email_hash}@${auth.email_domain}`
  }
  if (auth.email_hash) {
    return `user-${auth.email_hash}`
  }
  if (auth.email_domain) {
    return `user@${auth.email_domain}`
  }
  if (auth.provider) {
    return `auth-${auth.provider}`
  }
  return 'unknown'
}
