# shadcn/ui setup (Next.js + TypeScript)

Source: official shadcn/ui docs (ui.shadcn.com). Checked: 2026-01-28.

## Install / init (Next.js)
- New project (guided): use **shadcn/create** as recommended on the Next.js install page.
- Existing or new Next.js project: `pnpm dlx shadcn@latest init`
  - The `init` command installs dependencies, adds the `cn` util, and configures CSS variables.
  - You choose **Next.js** or **Next.js (Monorepo)** during the init flow.
  - CLI templates: `next` or `next-monorepo`.
- Add components: `pnpm dlx shadcn@latest add <component>` (example: `button`)

## Chart component (Recharts)
- Charts are built on Recharts; you compose Recharts charts and add shadcn helpers like `ChartContainer`, `ChartTooltip`, and `ChartLegend` as needed.
- Install with CLI: `pnpm dlx shadcn@latest add chart`
- Manual setup: add the `recharts` dependency and set the chart color CSS tokens (`--chart-1` … `--chart-5`) in `app/globals.css` as shown in the official docs.
- Remember to set a `min-h-[VALUE]` on `ChartContainer` so charts are responsive.
- Notes in docs: Recharts v3 upgrade is in progress; check the React 19 / Next.js 15 note before upgrading.

## Official references
- https://ui.shadcn.com/docs/installation/next
- https://ui.shadcn.com/docs/installation
- https://ui.shadcn.com/docs/cli
- https://ui.shadcn.com/docs/components/chart
- https://ui.shadcn.com/docs/monorepo
