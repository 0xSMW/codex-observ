import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getProvidersList } from '@/lib/metrics/providers'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = getDateRange(url.searchParams)
    const { pagination, errors: pageErrors } = parsePagination(url.searchParams, {
      defaultLimit: 25,
      maxLimit: 200,
    })

    const errors = [...rangeErrors, ...pageErrors]
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const { providers, total } = getProvidersList({ range, pagination })

    return jsonOk({
      range: rangeToResponse(range),
      pagination: paginationToResponse(pagination, total),
      providers,
    })
  } catch (error) {
    console.error('providers:list failed', error)
    return jsonError('Failed to load providers', 'internal_error', 500)
  }
}
