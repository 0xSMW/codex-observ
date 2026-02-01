'use client'

import { useParams } from 'next/navigation'

import { useSessionDetail } from '@/hooks/use-session-detail'
import { SessionDetail } from '@/components/sessions/session-detail'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id
  const { data, error, isLoading, refresh } = useSessionDetail(id)

  if (isLoading && !data) {
    return <TableSkeleton rows={6} />
  }

  if (error && !data) {
    const isNotFound =
      error.message?.toLowerCase().includes('not found') ||
      error.message?.includes('404')
    return (
      <ErrorState
        description={
          isNotFound
            ? 'Session not found. It may have been deleted, or the link may be incorrect. Open Sessions and pick a session from the list.'
            : error.message ?? "We couldn't load this session. Try refreshing."
        }
        onRetry={refresh}
      />
    )
  }

  if (!data) {
    return null
  }

  return <SessionDetail data={data} />
}
