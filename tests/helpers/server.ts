import { spawn, type ChildProcess } from 'node:child_process'
import path from 'path'
import { getPort } from 'get-port-please'

const repoRoot = path.resolve(__dirname, '../..')

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null

export async function startTestServer(env: Record<string, string> = {}): Promise<number> {
  if (serverProcess && serverPort) {
    return serverPort
  }

  const port = await getPort({ port: 3456, portRange: [3456, 3556] })
  serverPort = port

  return new Promise((resolve, reject) => {
    // Use next start (requires build); dev uses a lock that conflicts in tests
    serverProcess = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
      },
    })

    let started = false
    const timeout = setTimeout(() => {
      if (!started) {
        serverProcess?.kill()
        serverProcess = null
        reject(new Error('Server failed to start within 30s'))
      }
    }, 30_000)

    serverProcess.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.includes('Ready') || text.includes('started')) {
        if (!started) {
          started = true
          clearTimeout(timeout)
          resolve(port)
        }
      }
    })

    serverProcess.stderr?.on('data', () => {
      // Next.js logs to stderr; ignore for startup
    })

    serverProcess.on('error', (err) => {
      if (!started) {
        clearTimeout(timeout)
        reject(err)
      }
    })

    serverProcess.on('exit', (code) => {
      if (!started && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}`))
      }
    })
  })
}

export function stopTestServer(): void {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
  serverPort = null
}

export function getServerPort(): number | null {
  return serverPort
}
