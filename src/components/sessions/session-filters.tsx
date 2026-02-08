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
  originator: string
  cliVersion: string
  branch: string
  worktree: string
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
    <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="md:col-span-2 xl:col-span-2">
        <Input
          placeholder="Search by cwd, branch, or originator"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </div>
      <Select value={value.project} onValueChange={(project) => onChange({ ...value, project })}>
        <SelectTrigger className="w-full">
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
        <SelectTrigger className="w-full">
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
        <SelectTrigger className="w-full">
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
      <Input
        placeholder="Originator (exact)"
        value={value.originator}
        onChange={(event) => onChange({ ...value, originator: event.target.value })}
      />
      <Input
        placeholder="CLI version (exact)"
        value={value.cliVersion}
        onChange={(event) => onChange({ ...value, cliVersion: event.target.value })}
      />
      <Input
        placeholder="Branch (exact)"
        value={value.branch}
        onChange={(event) => onChange({ ...value, branch: event.target.value })}
      />
      <Input
        placeholder="Worktree ID (exact)"
        value={value.worktree}
        onChange={(event) => onChange({ ...value, worktree: event.target.value })}
      />
    </div>
  )
}
