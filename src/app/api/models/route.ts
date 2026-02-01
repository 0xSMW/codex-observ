import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getModelsList } from '@/lib/metrics/models'

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

    const { models, total } = getModelsList({ range, pagination })

    return jsonOk({
      range: rangeToResponse(range),
      pagination: paginationToResponse(pagination, total),
      models,
    })
  } catch (error) {
    console.error('models:list failed', error)
    return jsonError('Failed to load models', 'internal_error', 500)
  }
}
