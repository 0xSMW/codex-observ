import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getSessionDetail } from '@/lib/metrics/session-detail'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let id: string
  try {
    const params = await context.params
    id = typeof params?.id === 'string' ? params.id.trim() : ''
  } catch (e) {
    console.error('sessions:detail params failed', e)
    return jsonError('Invalid request', 'invalid_query', 400)
  }
  if (!id) {
    return jsonError('Missing session id', 'invalid_query', 400)
  }
  try {
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = getDateRange(url.searchParams)

    const messagePagination = parsePagination(url.searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
      prefix: 'message',
    })
    const modelPagination = parsePagination(url.searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
      prefix: 'model',
    })
    const toolPagination = parsePagination(url.searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
      prefix: 'tool',
    })

    const errors = [
      ...rangeErrors,
      ...messagePagination.errors,
      ...modelPagination.errors,
      ...toolPagination.errors,
    ]
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const result = getSessionDetail(
      id,
      range,
      messagePagination.pagination,
      modelPagination.pagination,
      toolPagination.pagination
    )

    if (!result.session) {
      return jsonError('Session not found', 'not_found', 404)
    }

    return jsonOk({
      range: rangeToResponse(range),
      session: result.session,
      stats: result.stats,
      messages: {
        pagination: paginationToResponse(messagePagination.pagination, result.messages.total),
        items: result.messages.items,
      },
      modelCalls: {
        pagination: paginationToResponse(modelPagination.pagination, result.modelCalls.total),
        items: result.modelCalls.items,
      },
      toolCalls: {
        pagination: paginationToResponse(toolPagination.pagination, result.toolCalls.total),
        items: result.toolCalls.items,
      },
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('sessions:detail failed', err.message, err.stack)
    return jsonError('Failed to load session', 'internal_error', 500)
  }
}
