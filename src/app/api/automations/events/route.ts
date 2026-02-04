import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getAutomationEvents } from '@/lib/metrics/automations'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = resolveRange(url.searchParams)
    const { pagination, errors: pageErrors } = parsePagination(url.searchParams, {
      defaultLimit: 25,
      maxLimit: 200,
    })

    const errors = [...rangeErrors, ...pageErrors]
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const search = parseSearchParam(url.searchParams, ['q', 'search'])

    const { total, events } = getAutomationEvents({ range, pagination, search })

    return jsonOk({
      range: rangeToResponse(range),
      pagination: paginationToResponse(pagination, total),
      events,
    })
  } catch (error) {
    console.error('automations:events failed', error)
    return jsonError('Failed to load automation events', 'internal_error', 500)
  }
}
