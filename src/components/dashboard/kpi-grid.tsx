import { KpiCard, type KpiCardProps } from '@/components/dashboard/kpi-card'

export function KpiGrid({ items }: { items: KpiCardProps[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  )
}
