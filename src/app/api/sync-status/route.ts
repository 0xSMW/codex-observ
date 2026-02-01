import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getLastSyncTime } from '@/lib/metrics/ingest'

export async function GET() {
  try {
    const lastSyncedAt = getLastSyncTime()
    return jsonOk({ lastSyncedAt })
  } catch (error) {
    console.error('sync-status: failed', error)
    return jsonError('Failed to load sync status', 'internal_error', 500)
  }
}
