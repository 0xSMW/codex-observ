import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getProjectDetail } from '@/lib/metrics/projects'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const { range, errors: rangeErrors } = resolveRange(url.searchParams)

    if (rangeErrors.length > 0) {
      return jsonError(rangeErrors.join('; '), 'invalid_query')
    }

    const { project, branches, history, tokenBreakdown } = getProjectDetail(id, range)

    if (!project) {
      return jsonError('Project not found', 'not_found', 404)
    }

    return jsonOk({
      range: rangeToResponse(range),
      project,
      branches,
      history,
      tokenBreakdown,
    })
  } catch (error) {
    console.error('projects:detail failed', error)
    return jsonError('Failed to load project', 'internal_error', 500)
  }
}
