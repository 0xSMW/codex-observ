don't edit package.json directly, package is updated by using pnpm commands
Shadcn/ui install + chart notes: `docs/shadcn.md`.
Project stack: Next.js + TypeScript + shadcn/ui.
Code style: Prettier (no semicolons, single quotes); run `pnpm format` before committing.

Style guidelines (UI): Prefer existing shared components (`ChartCard`, `KpiCard`, `ErrorState`, loading skeletons) over one-off markup. Use consistent spacing (`space-y-6` for page layout, `gap-4` in grids), card-style sections with border and padding, and a clear typography hierarchy (section titles, muted descriptions). Handle loading and error states explicitly; use lucide-react for icons. Reference `src/app/activity/page.tsx` and other dashboard pages for patterns.
