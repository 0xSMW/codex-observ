# shadcn Component Audit Report

Comparison of codebase usage vs. the proper shadcn component library (Accordion, Alert, Badge, Button, Card, Chart, etc.).

**Audit date:** 2026-02-01

---

## Summary

- **Installed shadcn UI components** (in `src/components/ui/`): badge, button, calendar, card, chart, checkbox, command, dialog, dropdown-menu, input, label, popover, scroll-area, select, separator, sheet, sidebar, skeleton, switch, table, tabs, tooltip.
- **Usage:** All interactive UI (buttons, inputs, selects, cards, tables, etc.) correctly imports from `@/components/ui/*`. No raw `<button>`, `<input>`, or `<select>` elements were found in app/layout/feature code.
- **Gaps:** A few areas use custom patterns or plain layout where shadcn primitives could be used for consistency and future-proofing.

---

## 1. Using shadcn correctly

| Area | Component(s) | Status |
|------|--------------|--------|
| Buttons | `Button` from `@/components/ui/button` | ✅ |
| Inputs | `Input` from `@/components/ui/input` | ✅ |
| Selects | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | ✅ |
| Cards | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardAction`, `CardFooter` | ✅ (CardAction is a local extension in `ui/card.tsx`) |
| Tables | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | ✅ |
| Charts | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` from `@/components/ui/chart` | ✅ |
| Dialogs/Sheets | `Dialog`, `Sheet` (sidebar uses Sheet) | ✅ |
| Navigation | `Sidebar`, `SidebarTrigger`, `SidebarProvider`, `SidebarInset` | ✅ |
| Overlays | `DropdownMenu`, `Popover`, `Tooltip` | ✅ |
| Feedback | `Badge`, `Skeleton` | ✅ |
| Tabs | `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` | ✅ |
| Calendar / date | `Calendar`, `Button`, `Popover` (date-range-picker) | ✅ |

No app or feature code uses raw HTML form elements instead of these shadcn components.

---

## 2. Not using proper shadcn components (recommended changes)

### 2.1 Pagination — use shadcn **Pagination**

**Current:** Custom pagination built from two `Button`s and a “Page X of Y” text.

**Locations:**

- `src/app/tools/page.tsx` (lines ~166–186): prev/next `Button`s + “Page {page} of {totalPages}”.
- `src/app/projects/projects-data-table.tsx` (lines ~94–119): “Page {pageIndex + 1} of {pageCount}” + Prev/Next `Button`s.

**Recommendation:** Add the shadcn **Pagination** component (`pnpm dlx shadcn@latest add pagination`) and replace both custom pagination UIs with it so styling and behavior match the design system.

---

### 2.2 Empty states — consider shadcn **Empty**

**Current:** Custom `EmptyState` in `src/components/shared/empty-state.tsx` (dashed border card, icon, title, description, optional action button). Used on projects and trends pages.

**Recommendation:** If your shadcn library includes an **Empty** component, consider migrating to it so empty states are consistent. If the design system’s Empty doesn’t match (e.g. no optional CTA), keeping the current `EmptyState` is fine as long as it continues to use shadcn `Button` (which it does).

---

### 2.3 Error / alert states — consider shadcn **Alert** or **Alert Dialog**

**Current:** Custom `ErrorState` in `src/components/shared/error-state.tsx` (dashed border card, destructive icon, title, description, “Try again” button). Used for API/load errors across pages.

**Recommendation:** For consistency with the design system, consider using shadcn **Alert** (or **Alert Dialog** for critical errors) and composing the same copy and retry action inside it. This would standardize error presentation and accessibility.

---

### 2.4 Table empty row — optional **Empty** or keep as-is

**Current:** `src/app/projects/projects-data-table.tsx` renders a single table row with “No results.” when there are no rows.

**Recommendation:** Acceptable as-is. If you adopt shadcn **Empty**, you could instead show an empty state block above or below the table (or in place of the table) when there are no results, for consistency with other empty views.

---

### 2.5 Forms (Session filters, etc.) — optional **Label** / **Field**

**Current:** `SessionFilters` and similar UIs use shadcn `Input` and `Select` with placeholders only; no visible `Label` or **Field** wrapper.

**Recommendation:** For accessibility and consistency with shadcn forms, consider adding **Label** (and **Field** if available) for filter inputs where it makes sense (e.g. “Search”, “Project”, “Model”, “Provider”). Not required if the design is intentionally placeholder-only.

---

### 2.6 Loading — optional **Spinner**

**Current:** Loading is handled with shadcn **Skeleton** in `loading-skeleton.tsx` (KpiSkeleton, ChartSkeleton, TableSkeleton). No inline **Spinner** is used (e.g. on buttons or small areas).

**Recommendation:** If you add actions that need inline loading (e.g. “Refresh” or “Submit”), add shadcn **Spinner** and use it there. No change needed for current full-page/content loading.

---

### 2.7 Toasts / notifications — **Sonner** or **Toast** when needed

**Current:** No toast or global notification component in the codebase.

**Recommendation:** When you need success/error toasts (e.g. after actions or background sync), add shadcn **Sonner** or **Toast** and use it instead of ad-hoc alerts or custom notification UI.

---

## 3. shadcn components in your list but not used (no action required)

These are in the library list but are not required by current features; add them when a feature needs them:

- Accordion, Alert Dialog, Aspect Ratio, Avatar, Breadcrumb, Button Group, Carousel, Collapsible, Combobox, Context Menu, Data Table (you use Table + TanStack; Data Table is optional), Date Picker (you have date-range-picker with Calendar + Popover), Direction, Drawer, Field, Hover Card, Input Group, Input OTP, Item, Kbd, Menubar, Native Select, Navigation Menu, Progress, Radio Group, Resizable, Slider, Toggle, Toggle Group, Typography.

---

## 4. Checklist for “proper” shadcn usage

| Check | Status |
|-------|--------|
| No raw `<button>` / `<input>` / `<select>` in app/feature code | ✅ |
| Buttons from `@/components/ui/button` | ✅ |
| Inputs from `@/components/ui/input` | ✅ |
| Selects from `@/components/ui/select` | ✅ |
| Cards from `@/components/ui/card` | ✅ |
| Tables from `@/components/ui/table` | ✅ |
| Pagination from shadcn **Pagination** | ❌ → use Pagination |
| Empty states from shadcn **Empty** (optional) | ⚠️ Custom EmptyState |
| Error/alert from shadcn **Alert** (optional) | ⚠️ Custom ErrorState |
| Forms use **Label** / **Field** where appropriate (optional) | ⚠️ Placeholder-only in filters |
| Toasts from **Sonner** / **Toast** when needed | ⚠️ Not used yet |

---

## 5. Recommended next steps (in order)

1. **Add and use shadcn Pagination** in `src/app/tools/page.tsx` and `src/app/projects/projects-data-table.tsx` (and any other custom prev/next pagination).
2. **Evaluate shadcn Empty** and, if it fits, migrate `EmptyState` to use it (or keep current component and document it as the app’s empty pattern).
3. **Evaluate shadcn Alert** for `ErrorState` and, if it fits, refactor error UIs to use Alert (or Alert Dialog for critical cases).
4. When adding toasts or inline loading, introduce **Sonner**/ **Toast** and **Spinner** from shadcn.
5. Optionally add **Label** (and **Field**) to filter forms for accessibility and consistency.

Once Pagination is switched over, the only remaining “not using proper shadcn” spots are the optional Empty, Alert, and form Label/Field improvements above.
