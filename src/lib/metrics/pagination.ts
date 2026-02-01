export interface Pagination {
  limit: number
  offset: number
}

export interface PaginationParseResult {
  pagination: Pagination
  errors: string[]
}

interface PaginationOptions {
  defaultLimit?: number
  maxLimit?: number
  prefix?: string
}

function parseNumber(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

export function parsePagination(
  params: URLSearchParams,
  options: PaginationOptions = {}
): PaginationParseResult {
  const errors: string[] = []
  const prefix = options.prefix ?? ''
  const defaultLimit = options.defaultLimit ?? 50
  const maxLimit = options.maxLimit ?? 500

  const limitRaw = params.get(`${prefix}limit`) ?? params.get(`${prefix}pageSize`)
  const pageRaw = params.get(`${prefix}page`)
  const offsetRaw = params.get(`${prefix}offset`)

  const limitParsed = parseNumber(limitRaw)
  const pageParsed = parseNumber(pageRaw)
  const offsetParsed = parseNumber(offsetRaw)

  if (limitRaw && limitParsed === null) {
    errors.push(`Invalid ${prefix}limit: ${limitRaw}`)
  }
  if (pageRaw && pageParsed === null) {
    errors.push(`Invalid ${prefix}page: ${pageRaw}`)
  }
  if (offsetRaw && offsetParsed === null) {
    errors.push(`Invalid ${prefix}offset: ${offsetRaw}`)
  }

  let limit = limitParsed ?? defaultLimit
  if (limit < 1) {
    limit = defaultLimit
  }
  if (limit > maxLimit) {
    limit = maxLimit
  }

  let offset = offsetParsed ?? 0
  if (pageParsed !== null && pageParsed > 0) {
    offset = Math.max(0, (pageParsed - 1) * limit)
  }
  if (offset < 0) {
    offset = 0
  }

  return {
    pagination: { limit, offset },
    errors,
  }
}

export function paginationToResponse(
  pagination: Pagination,
  total: number
): {
  limit: number
  offset: number
  total: number
  page: number
  pageSize: number
} {
  const pageSize = pagination.limit
  const page = pageSize > 0 ? Math.floor(pagination.offset / pageSize) + 1 : 1
  return {
    limit: pagination.limit,
    offset: pagination.offset,
    total,
    page,
    pageSize,
  }
}
