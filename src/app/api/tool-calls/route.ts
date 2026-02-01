import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { parseListParam, parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getToolCallsList } from '@/lib/metrics/tool-calls'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = getDateRange(url.searchParams)
    const { pagination, errors: pageErrors } = parsePagination(url.searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
    })

    const errors = [...rangeErrors, ...pageErrors]
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const status = parseListParam(url.searchParams, ['status', 'statuses'])
    const tools = parseListParam(url.searchParams, ['tools', 'tool'])
    const sessionId = parseSearchParam(url.searchParams, ['session', 'sessionId'])
    const search = parseSearchParam(url.searchParams, ['q', 'search'])

    const result = getToolCallsList({
      range,
      pagination,
      status: status.length ? status : undefined,
      tools: tools.length ? tools : undefined,
      sessionId,
      search,
    })

    return jsonOk({
      range: rangeToResponse(range),
      filters: { status, tools, sessionId, search },
      pagination: paginationToResponse(pagination, result.total),
      summary: result.summary,
      toolCalls: result.toolCalls,
    })
  } catch (error) {
    console.error('tool-calls:list failed', error)
    return jsonError('Failed to load tool calls', 'internal_error', 500)
  }
}
