import { jsonError, jsonOk } from '@/lib/metrics/http';
import { getIngestStatus, runIngest } from '@/lib/metrics/ingest';

export async function GET() {
  try {
    const status = getIngestStatus();
    return jsonOk({
      status: status.status,
      lastRun: status.lastRun ? new Date(status.lastRun).toISOString() : null,
      lastResult: status.lastResult,
    });
  } catch (error) {
    console.error('ingest:list failed', error);
    return jsonError('Failed to load ingest status', 'internal_error', 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode =
      typeof body?.mode === 'string' && body.mode === 'full' ? 'full' : 'incremental';
    const result = await runIngest(mode);
    return jsonOk({
      status: 'idle',
      lastRun: new Date().toISOString(),
      lastResult: result,
    });
  } catch (error) {
    console.error('ingest:run failed', error);
    return jsonError('Failed to run ingest', 'internal_error', 500);
  }
}
