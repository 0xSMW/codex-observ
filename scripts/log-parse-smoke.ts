import path from 'path'
import { parseLogFile } from '../src/lib/ingestion/log-parser'

async function main() {
  const logPath = path.resolve(
    process.cwd(),
    'src',
    'lib',
    'ingestion',
    '__fixtures__',
    'codex-tui.log'
  )

  const result = await parseLogFile(logPath, 0)
  const counts = result.toolCalls.reduce(
    (acc, call) => {
      acc.total += 1
      acc[call.status] += 1
      return acc
    },
    { total: 0, ok: 0, failed: 0, unknown: 0 }
  )

  console.log('log-parse-smoke')
  console.log(`parsed: ${result.toolCalls.length} tool calls`)
  console.log(`status: ok=${counts.ok} failed=${counts.failed} unknown=${counts.unknown}`)

  for (const call of result.toolCalls) {
    const duration = call.duration_ms ?? '-'
    console.log(
      `- ${call.tool_name} ${call.status} cmd=${call.command ?? '-'} duration=${duration}`
    )
  }

  if (result.errors.length) {
    console.log('errors:')
    for (const err of result.errors) {
      console.log(`- line ${err.line}: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
