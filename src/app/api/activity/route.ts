import { resolveRange, rangeToResponse } from '@/lib/metrics/date-range'
import { jsonError, jsonOk } from '@/lib/metrics/http'
import { getActivity } from '@/lib/metrics/activity'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const { range, errors } = resolveRange(url.searchParams)
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query')
    }

    const { activity, summary } = getActivity(range)

    // Calculate previous period for comparison (Year-over-Year)
    // The activity view is typically yearly, so we shift back 1 year
    const start = range.startMs ? new Date(range.startMs) : new Date()
    const end = range.endMs ? new Date(range.endMs) : new Date()

    // Naive one year shift
    const prevStart = new Date(start)
    prevStart.setFullYear(start.getFullYear() - 1)

    const prevEnd = new Date(end)
    prevEnd.setFullYear(end.getFullYear() - 1)

    const prevRange = {
      ...range,
      startMs: prevStart.getTime(),
      endMs: prevEnd.getTime(),
    }

    // Get previous stats
    const { summary: prevSummary } = getActivity(prevRange)

    summary.prevTotalMessages = prevSummary.totalMessages
    summary.prevTotalCalls = prevSummary.totalCalls
    summary.prevTotalTokens = prevSummary.totalTokens
    summary.prevTotalSessions = prevSummary.totalSessions
    summary.prevActiveDays = prevSummary.activeDays

    return jsonOk({
      range: rangeToResponse(range),
      activity,
      summary,
    })
  } catch (error) {
    console.error('activity:failed', error)
    return jsonError('Failed to load activity', 'internal_error', 500)
  }
}
