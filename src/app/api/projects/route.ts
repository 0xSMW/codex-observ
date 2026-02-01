import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getProjectsList } from '@/lib/metrics/projects'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = resolveRange(url.searchParams)
    const { pagination, errors: pageErrors } = parsePagination(url.searchParams, {
      defaultLimit: 25,
      maxLimit: 100,
    })

    const errors = [...rangeErrors, ...pageErrors]
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const search = parseSearchParam(url.searchParams, ['q', 'search'])

    const { projects, total } = getProjectsList({
      range,
      pagination,
      search,
    })

    return jsonOk({
      range: rangeToResponse(range),
      filters: { search },
      pagination: paginationToResponse(pagination, total),
      projects,
    })
  } catch (error) {
    console.error('projects:list failed', error)
    return jsonError('Failed to load projects', 'internal_error', 500)
  }
}
