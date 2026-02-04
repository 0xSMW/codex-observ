import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getDesktopLogStatus } from '@/lib/metrics/desktop-logs'

export async function GET() {
  try {
    const status = getDesktopLogStatus()
    return jsonOk(status)
  } catch (error) {
    console.error('desktop-logs:status failed', error)
    return jsonError('Failed to load desktop log status', 'internal_error', 500)
  }
}
