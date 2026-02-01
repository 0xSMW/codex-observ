declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(
      path: string,
      options?: {
        timeout?: number
        enableForeignKeyConstraints?: boolean
      }
    )
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }

  export interface StatementSync {
    get(
      params?: Record<string, unknown> | unknown,
      ...rest: unknown[]
    ): Record<string, unknown> | undefined
    all(params?: Record<string, unknown> | unknown, ...rest: unknown[]): Record<string, unknown>[]
    run(
      params?: Record<string, unknown> | unknown,
      ...rest: unknown[]
    ): { changes: number | bigint; lastInsertRowid: number | bigint }
  }
}
