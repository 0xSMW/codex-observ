import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getOverview } from '@/lib/metrics/overview'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors } = getDateRange(url.searchParams)
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const data = getOverview(range)
    return jsonOk({ range: rangeToResponse(range), ...data })
  } catch (error) {
    console.error('overview:failed', error)
    return jsonError('Failed to load overview', 'internal_error', 500)
  }
}
