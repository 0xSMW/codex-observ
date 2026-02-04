import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getAutomations } from '@/lib/metrics/automations'
import { cachedQuery } from '@/lib/performance/cache'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors } = resolveRange(url.searchParams)
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const cacheKey = `automations:metrics:${url.searchParams.toString()}`
    const data = cachedQuery(
      cacheKey,
      () => ({
        range: rangeToResponse(range),
        ...getAutomations(range),
      }),
      30000
    )

    return jsonOk(data, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('automations:metrics failed', error)
    return jsonError('Failed to load automation metrics', 'internal_error', 500)
  }
}
