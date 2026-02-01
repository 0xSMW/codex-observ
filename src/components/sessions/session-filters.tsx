'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type SessionFiltersValue = {
  search: string
  model: string
  provider: string
  project: string
}

export function SessionFilters({
  value,
  models,
  providers,
  projects,
  onChange,
}: {
  value: SessionFiltersValue
  models: string[]
  providers: string[]
  projects: { id: string; name: string }[]
  onChange: (next: SessionFiltersValue) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center">
      <div className="flex-1">
        <Input
          placeholder="Search by cwd, branch, or originator"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </div>
      <Select value={value.project} onValueChange={(project) => onChange({ ...value, project })}>
        <SelectTrigger className="w-full lg:w-48">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name || p.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.model} onValueChange={(model) => onChange({ ...value, model })}>
        <SelectTrigger className="w-full lg:w-48">
          <SelectValue placeholder="All models" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All models</SelectItem>
          {models.map((model) => (
            <SelectItem key={model} value={model}>
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.provider} onValueChange={(provider) => onChange({ ...value, provider })}>
        <SelectTrigger className="w-full lg:w-48">
          <SelectValue placeholder="All providers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All providers</SelectItem>
          {providers.map((provider) => (
            <SelectItem key={provider} value={provider}>
              {provider}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
