import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { parseListParam, parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getSessionsList } from '@/lib/metrics/sessions'

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

    const search = parseSearchParam(url.searchParams, ['q', 'search'])
    const models = parseListParam(url.searchParams, ['models', 'model'])
    const providers = parseListParam(url.searchParams, ['providers', 'provider'])
    const project = parseSearchParam(url.searchParams, ['project', 'projectId'])
    const branch = parseSearchParam(url.searchParams, ['branch'])
    const worktree = parseSearchParam(url.searchParams, ['worktree', 'projectRefId'])
    const originator = parseSearchParam(url.searchParams, ['originator'])
    const cliVersion = parseSearchParam(url.searchParams, ['cliVersion', 'cli_version'])

    const { sessions, total } = getSessionsList({
      range,
      search,
      models: models.length ? models : undefined,
      providers: providers.length ? providers : undefined,
      project: project ?? undefined,
      branch: branch ?? undefined,
      worktree: worktree ?? undefined,
      originator: originator ?? undefined,
      cliVersion: cliVersion ?? undefined,
      pagination,
    })

    return jsonOk({
      range: rangeToResponse(range),
      filters: { search, models, providers, project, branch, worktree, originator, cliVersion },
      pagination: paginationToResponse(pagination, total),
      sessions,
    })
  } catch (error) {
    console.error('sessions:list failed', error)
    return jsonError('Failed to load sessions', 'internal_error', 500)
  }
}
