import { getPerformanceSnapshot } from '@/lib/performance/profiler'
import { runIngest } from '@/lib/metrics/ingest'
import { setIngestHandler, startWatcher, subscribe } from '@/lib/watcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

function encodeEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function GET(request: Request): Promise<Response> {
  setIngestHandler(async () => runIngest('incremental'))
  startWatcher()
  void runIngest('incremental')

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encodeEvent(event, data))
      }

      send('metrics', {
        ts: Date.now(),
        metrics: getPerformanceSnapshot(),
      })

      const unsubscribe = subscribe((event) => {
        if (event.type === 'ingest' || event.type === 'metrics') {
          send(event.type, event.payload)
        }
      })

      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: Date.now() })
      }, 30000)

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
