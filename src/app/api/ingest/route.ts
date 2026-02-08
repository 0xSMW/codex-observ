import { parseSearchParam } from '@/lib/metrics/filters'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { paginationToResponse, parsePagination } from '@/lib/metrics/pagination'
import { getIngestState, getIngestStatus, runIngest } from '@/lib/metrics/ingest'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { pagination, errors: pageErrors } = parsePagination(url.searchParams, {
      defaultLimit: 25,
      maxLimit: 200,
    })
    if (pageErrors.length > 0) {
      return jsonError(pageErrors.join('; '), 'invalid_query')
    }
    const search = parseSearchParam(url.searchParams, ['q', 'search'])
    const ingestState = getIngestState({ pagination, search })
    const status = getIngestStatus()
    return jsonOk({
      status: status.status,
      lastRun: status.lastRun ? new Date(status.lastRun).toISOString() : null,
      lastResult: status.lastResult,
      filters: { search },
      summary: ingestState.summary,
      pagination: paginationToResponse(pagination, ingestState.total),
      files: ingestState.items,
    })
  } catch (error) {
    console.error('ingest:list failed', error)
    return jsonError('Failed to load ingest status', 'internal_error', 500)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const mode = typeof body?.mode === 'string' && body.mode === 'full' ? 'full' : 'incremental'
    const result = await runIngest(mode)
    return jsonOk({
      status: 'idle',
      lastRun: new Date().toISOString(),
      lastResult: result,
    })
  } catch (error) {
    console.error('ingest:run failed', error)
    return jsonError('Failed to run ingest', 'internal_error', 500)
  }
}
