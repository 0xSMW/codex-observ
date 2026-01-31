import { getDateRange, rangeToResponse } from '@/lib/metrics/date-range';
import { jsonError, jsonOk } from '@/lib/metrics/http';
import { getActivity } from '@/lib/metrics/activity';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { range, errors } = getDateRange(url.searchParams);
    if (errors.length > 0) {
      return jsonError(errors.join('; '), 'invalid_query');
    }

    const { activity, summary } = getActivity(range);

    return jsonOk({
      range: rangeToResponse(range),
      activity,
      summary,
    });
  } catch (error) {
    console.error('activity:failed', error);
    return jsonError('Failed to load activity', 'internal_error', 500);
  }
}
