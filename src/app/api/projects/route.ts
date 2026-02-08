import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getProjectsList, type ProjectSortKey, type SortOrder } from '@/lib/metrics/projects'
import { cachedQuery } from '@/lib/performance/cache'

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
    const sortByRaw = parseSearchParam(url.searchParams, ['sortBy'])
    const sortOrderRaw = parseSearchParam(url.searchParams, ['sortOrder'])
    const sortBy = (
      ['lastSeen', 'firstSeen', 'name', 'sessionCount', 'totalTokens'] as ProjectSortKey[]
    ).includes(sortByRaw as ProjectSortKey)
      ? (sortByRaw as ProjectSortKey)
      : undefined
    const sortOrder =
      sortOrderRaw === 'asc' || sortOrderRaw === 'desc' ? (sortOrderRaw as SortOrder) : undefined

    const cacheKey = `projects:list:${url.searchParams.toString()}`
    const data = cachedQuery(
      cacheKey,
      () => {
        const { projects, total } = getProjectsList({
          range,
          pagination,
          search,
          sortBy,
          sortOrder,
        })

        return {
          range: rangeToResponse(range),
          filters: { search },
          pagination: paginationToResponse(pagination, total),
          projects,
        }
      },
      30000
    )

    return jsonOk(data, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('projects:list failed', error)
    return jsonError('Failed to load projects', 'internal_error', 500)
  }
}
