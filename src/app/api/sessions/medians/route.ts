import { fetchPricing } from '@/lib/pricing'
import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getSessionMedians } from '@/lib/metrics/session-medians'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors } = resolveRange(url.searchParams)
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const pricingData = await fetchPricing()
    const { series, summary } = getSessionMedians({ range, pricingData })
    return jsonOk({ range: rangeToResponse(range), series, summary })
  } catch (error) {
    console.error('sessions:medians failed', error)
    return jsonError('Failed to load session medians', 'internal_error', 500)
  }
}
