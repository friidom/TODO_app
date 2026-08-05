# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build  — the only typecheck; run it before claiming a change compiles
npm run lint      # eslint .
npm run preview   # serve the built bundle
npx prettier --write src/...   # no script for it; prettier-plugin-tailwindcss sorts class names
```

No test framework is installed. Pure logic worth checking gets a `*.check.ts` sibling with `node:assert` — run it directly and it prints a pass line:

```bash
node --experimental-strip-types src/services/lib/todos/insertDense.check.ts
node --experimental-strip-types src/services/columns/limitBreach.check.ts
```

`tsconfig.app.json` excludes `src/**/*.check.ts`, so they never reach `npm run build` (they'd fail on node types — `types` is pinned to `vite/client`).

`README.md` is the untouched Vite template — ignore it (it claims React Compiler is enabled; the babel plugin is commented out in `vite.config.ts`).

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (gitignored).

## Architecture

Vite + React 19 + TypeScript, Supabase for auth/data, TanStack Query as the only real state layer, Tailwind v4 (CSS-first, no tailwind.config), `@dnd-kit/core` for the board.

**Data flow.** `src/services/api/*` and `src/services/columns/columnsApi.ts` are the raw Supabase calls; `src/services/lib/todos/*` and `src/services/columns/use*.ts` wrap them in query/mutation hooks; components consume the hooks. Two query keys hold everything: `["todos"]` (one flat array for the whole board, not per-column) and `["columns"]`. `useTodosByColumns` does the grouping and position-sorting client-side. Most mutations optimistically patch the `["todos"]` cache rather than invalidating.

**Positions.** Both todos and columns carry a dense integer `position`. Reordering means: recompute every affected position client-side, write the whole array into the query cache, then bulk `upsert` it (`reorderTodos` / `reorderColumns`). Never assume a partial update is enough — gaps in `position` break the sort.

**Drag and drop is hand-rolled, not `@dnd-kit/sortable`.** Nothing in the board reflows while dragging; only the `DragOverlay` moves. The pieces:

- `src/hooks/useKanbanDnd.ts` — sensors, a custom `collisionDetection` that ignores rect intersection and picks the _gap nearest the pointer_, and the two indicator states.
- `DropZone` / `ColumnDropZone` — always-mounted droppables sitting _between_ cards/columns, ids `todo-gap:<columnId>:<index>` and `column-gap:<index>`. They exist to be measured, and paint a blue line when they're the nearest gap. Each also carries `beforeId`/`afterId` (its two neighbours) so `collisionDetection` can drop the hit when the gap touches the dragged item — otherwise the indicator would offer a no-op drop around the item itself. Idle, `DropZone` doubles as the create affordance (hover → `+` → `TodoCreateForm` opens at that index).
- `KanbanBoard.tsx` `onDragEnd` — column branch does `arrayMove` + `reorderColumns`; todo branch delegates to `todoDrop`. It also derives the cross-column transition state (`activeTodo.column_id` vs `indicator.columnId`) and feeds `KanbanColumn` the `isDragSource` / `transition` props that swap the headers and highlight the destination. Same-column drags are pure reordering, so `transition` stays null there.
- `src/services/lib/todos/useTodoDrop.ts` — splices the card into the destination column at the indicator index and renumbers both source and destination.

Droppable `data.type` is the dispatch key throughout: `"column" | "column-gap" | "todo-gap"`. Adding a drop target means adding a type here and handling it in `handleDragOver` + `collisionDetection`.

**Auth.** `useAuth` is a plain hook holding its own `useState` and its own `onAuthStateChange` subscription — it is _not_ a context, so each call site gets an independent copy (and its own `loading` flip). Routes in `components/routes/` gate on it. `signUp` in `authApi.ts` also seeds the profile row and four default columns ("To Do" / "In Progress" / "In Review" / "Done") — new users depend on that side effect.

**Column management.** `components/columns/` owns everything a column can do: `ColumnHeader` picks one of four header states (transition pills / "Transition to..." / inline rename / normal), `ColumnMenu` is the three-dot menu, and the modals handle limits and deletion. `KanbanBoard` holds the state these need — which columns are collapsed (client-only, not persisted), and which column each modal targets. Deleting a column rehomes its todos server-side first (`deleteColumn` in `columnsApi.ts`), so the delete modal always makes you pick a destination and the option is hidden when only one column is left.

**Column limits.** `min_limit`/`max_limit` are nullable and advisory — `limitBreach()` turns a breach into the header's warning text and nothing more. They never block a drop. SQL in `supabase/add-column-limits.sql`.

**Column categories.** `columns.category` is a checked text field (`'todo' | 'in_progress' | 'done'`) — a fixed set users pick from, never define, so there is no lookup table. The palette lives in `src/constants/columns.ts`, not the DB: colours are presentation, so retuning them is an edit rather than a migration. `categoryOf()` falls back to `todo`, so rows written before `supabase/add-column-category.sql` ran still render.

**i18n.** `src/components/i18n/` (en/ru/uz, language in `localStorage`). Column titles are run through `t()`, so the seeded English titles double as translation keys.

**Theme.** `ThemeProvider` toggles a `dark` class on `<html>`; the `@custom-variant dark` in `src/styles/global.css` keys off it. All design tokens are CSS vars in that file.

## Gotchas

- `components.json` maps `utils` to `@/lib/utils`, which does not exist — `cn` actually lives in `@/services/lib/utils`. Fix the import after any `npx shadcn add`.
- `@/` → `src/`, declared in both `vite.config.ts` and `tsconfig.app.json`. Existing imports mix `@/` and relative paths freely.
- `HeaderTodoForm.tsx` is live (rendered by `Header.tsx`) but broken: it calls `useAddTodo` with `{ title, status: "todo" }` — no `column_id`, and `status` predates the columns schema. It fails `npm run build`.
- Vendored shadcn components live in `src/components/ui/SideBarUI/` (not `ui/` directly) and are built on `radix-ui` + `@base-ui/react`.
- `noUnusedLocals`/`noUnusedParameters` are on, so an unused import fails `npm run build` even though the dev server is happy.

