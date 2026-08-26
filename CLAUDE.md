# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build  — the only typecheck; run it before claiming a change compiles
npm run lint      # eslint .
npm test          # vitest run
npm run test:watch
npm run preview   # serve the built bundle
npx prettier --write src/...   # no script for it; prettier-plugin-tailwindcss sorts class names
```

**Vitest is the only test mechanism** — the `*.check.ts` + `node --experimental-strip-types` self-checks are gone, ported to `*.test.ts` siblings. Two ways to run tests meant two things to remember; there is one now, and CI runs `npm test` rather than enumerating files.

Pure logic worth checking gets a `*.test.ts` sibling next to it. `vitest.config.ts` is standalone rather than a `test` block in `vite.config.ts`: these tests are pure TypeScript and need neither the React plugin nor Tailwind. Test files are **not** excluded from `tsconfig.app.json`, so `tsc -b` typechecks them and a test that drifts from its subject's types fails the build, not just the run.

No React Testing Library, deliberately: pure logic is where the risk is, and component tests nobody needs are a maintenance cost. Revisit if a component grows logic worth pinning down.

`README.md` is otherwise the untouched Vite template — ignore it, except for its React Compiler section, which M9-04 rewrote. **The React Compiler is not enabled and its plugin is gone** (measured: 2.7x build time, +25% on the board chunk, against an unprofiled saving). `vite.config.ts` records why; M9-05 is the trigger to revisit.

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (gitignored). `src/services/api/supabase.ts` throws at module load if either is missing. Vite inlines them at build time, so a missing variable is a rebuild, not a redeploy.

## Database migrations

Schema changes go through the CLI, never the Supabase SQL editor — a change made in the dashboard is a change that does not exist.

```bash
npm run db:diff -- -f <name>   # capture local changes as a new migration
npm run db:push                # apply pending migrations to the linked project
npm run db:pull                # import remote changes the CLI does not know about
npm run db:types               # regenerate src/types/database.ts
```

`db:pull`, `db:diff` and `db:dump` need **Docker Desktop running** — they provision a local shadow database to diff against. `db:push` and `db:types` do not.

Migrations are forward-only: there is no `down`. Reversing means writing a new migration. Expand → backfill → contract, one migration each, never combined. Dumps land in `backups/` and are gitignored — they contain user data.

The linked project is `nxnnfaoyttbzndphnawe`. **PITR is not enabled on it**, so there is no point-in-time recovery for a bad data migration; enable it before any destructive work.

## Architecture

Vite + React 19 + TypeScript, Supabase for auth/data, TanStack Query as the only real state layer, Tailwind v4 (CSS-first, no tailwind.config), `@dnd-kit/core` for the board.

**Data flow.** One folder per feature under `src/services/`: `todos/`, `boards/`, `columns/`, `auth/`, `profile/`, `spaces/`, `members/`, `invites/`, `comments/`, `activities/`, `notifications/`, `forYou/`, `realtime/`, `views/`, each holding its `<feature>Api.ts` (the raw Supabase calls) next to the `use*.ts` hooks that wrap it. Components consume the hooks and import them by path — there is no barrel. The two exceptions are `services/api/supabase.ts`, the shared client, and `services/queryClient/`. Every key is board-scoped and comes from the factory in `src/services/queryClient/queryKeys.ts` — `queryKeys.todos(boardId)` (one flat array for the whole board, not per-column), `queryKeys.columns(boardId)`, `queryKeys.boards()` for the index, `queryKeys.board(boardId)` for one board's own row, `queryKeys.members(boardId)`, `queryKeys.invites(boardId)`, `queryKeys.activities(boardId)`, `queryKeys.comments(todoId)`, `queryKeys.todo(todoId)`, `queryKeys.profile(userId)`, and the non-board-scoped `queryKeys.forYou()` / `queryKeys.notifications()` families, which answer "what is mine" across every board RLS lets the caller reach rather than "what is on this board". No key is spelled out anywhere else. `boardId` is a *required* argument even though it may be `undefined`: making it required is what turned "find every place that reads the board" into a compiler error instead of a grep, and `undefined` is a real state — the route param before it resolves — keying an entry whose query is disabled. `useTodosByColumns` buckets cards into columns client-side and deliberately does *not* order them — `useVisibleTodos` has already put the array in display order, and sorting again there is what made the board and the list two implementations of one rule. Most mutations optimistically patch the `["todos", boardId]` cache rather than invalidating. *How* they patch it lives in `services/todos/cache.ts` and `services/columns/cache.ts`, not in the hooks: pure `(rows, …) => rows` functions (`applyTodoInserted` / `Updated` / `Deleted` / `Moved` and the column equivalents), each with a `cache.test.ts` sibling. They are outside the closures deliberately — M6-B's realtime handlers (`services/realtime/events.ts`, one channel per board via `useBoardRealtime`) apply the same transformations to the same array when the change arrives from another client, and a channel callback cannot reach into an `onMutate`. None of them mutates its input: `onMutate` snapshots the cached array for rollback and the cache holds those very objects, so renumbering in place would leave `onError` nothing to restore. The client's defaults live in `queryClient.ts`: a 30s `staleTime` (so a tab switch is not a board refetch), a 10min `gcTime`, no retries on mutations, and `retryPolicy.ts` for queries — which reads both error shapes Supabase produces, because a PostgREST error carries a `code` and no HTTP status, so an RLS denial would otherwise be retried three times before surfacing. Failures surface centrally from that same file: the `MutationCache` toasts every rejected mutation, the `QueryCache` toasts only a failed *refetch* (a failed first load is already rendered by the component that owns the query). Opt out with `meta: { silent: true }` — typed through a `Register` augmentation — rather than adding a per-mutation error toast. Render throws are a separate path: `components/ErrorBoundary.tsx` wraps each column's card list so one bad card costs that list and nothing else, and every route carries an `errorElement` as the outer net.

**Boards own everything (M2).** A board is the unit of ownership: `boards.owner_id` references `profiles`, and `columns.board_id` / `todos.board_id` are `NOT NULL` with foreign keys. RLS says so too — every policy on `columns` and `todos` is `board_id in (select accessible_board_ids())`, a `SECURITY DEFINER STABLE` helper that is the single swap point M3 widens to `board_members` without touching a policy. `user_id` is **gone** from both tables; authorship survives as `todos.creator_id`, which has no `auth.uid()` default, so `addTodo` sends it explicitly. `todos.completed` is gone as well — doneness is derived from the column's `category === 'done'`, and there is no second source of truth. `todos.id` is a **uuid the client mints** (`crypto.randomUUID()`), which is why the optimistic row and the stored row are the same row and there is no `isOptimistic` flag; `addTodo` upserts rather than inserts, so a racing `reorderTodos` cannot strand a half-written row. Cards are labelled `KAN-{todos.board_key}`, a per-board counter allocated by a `BEFORE INSERT` trigger from `boards.next_key` — not the row id, which is unreadable. Keys are never reused: deleting KAN-2 and creating another card gives KAN-4. `board_key` is null for the moment a card is in flight, and that absence is the pending state.

New users are provisioned by the `provision_new_user()` RPC, not by the client: it creates the profile, the board and the four default columns in one transaction and is idempotent, so a retried signup cannot mint a second board.

**Ordering (ranks, since M6-A).** Both todos and columns carry a `rank` — a `double precision` sort key, not a sequence position. A move computes one value *between* the two neighbours it lands amongst (`rankBetween` / `rankForDrop` / `rankForAppend` in `src/utils/rank.ts`) and writes **one row** (`moveTodo`, `moveColumnRank`). That single-row write is the point: the old dense-integer scheme renumbered whole columns from each client's own snapshot and wrote the entire array, so two people dragging at once overwrote each other's cards — including cards neither had touched.

`byRank` is the comparator both features sort with, in `src/utils/rank.ts`. It falls back to `position * RANK_GAP` when a rank is missing, which is why a row written by an older client still sorts where it belongs. The dense integer `position` column still exists as a lazily-updated mirror; nothing reads it for ordering except that fallback.

Doubles run out of room between two neighbours eventually — `rankBetween` returns `null` and the caller rebalances the column (`rebalanceColumnRanks` / `rebalanceBoardColumnRanks`). `reorderTodos` survives for exactly one job: `useAddTodo` correcting the positions of a column after a mid-column insert.

**Drag and drop is hand-rolled, not `@dnd-kit/sortable`.** Nothing in the board reflows while dragging; only the `DragOverlay` moves. The pieces:

- `src/hooks/useKanbanDnd.ts` — sensors, a custom `collisionDetection` that ignores rect intersection and picks the _gap nearest the pointer_, and the two indicator states.
- `DropZone` / `ColumnDropZone` — always-mounted droppables sitting _between_ cards/columns, ids `todo-gap:<columnId>:<index>` and `column-gap:<index>`. They exist to be measured, and paint a blue line when they're the nearest gap. Each also carries `beforeId`/`afterId` (its two neighbours) so `collisionDetection` can drop the hit when the gap touches the dragged item — otherwise the indicator would offer a no-op drop around the item itself. Idle, `DropZone` doubles as the create affordance (hover → `+` → `TodoCreateForm` opens at that index).
- `src/hooks/useBoardDragEnd.ts` — the whole `onDragEnd` body, extracted from `KanbanBoard`'s JSX (M2-17). Column branch calls the `moveColumn` it is handed; todo branch delegates to `useTodoDrop`. It also derives the cross-column transition state (`activeTodo.column_id` vs `indicator.columnId`) and returns the `isDragSource` / `transition` inputs that swap the headers and highlight the destination. Same-column drags are pure reordering, so `transition` stays null there. `KanbanBoard.tsx` only wires the result to `<DndContext onDragEnd={…}>`.
- `src/hooks/useColumnReorder.ts` — supplies that `moveColumn` (M2-18): `applyColumnMoved` + a cache write + `reorderColumns`. It writes the cache itself *and* the mutation's `onMutate` writes it again; the two are not redundant, because `onMutate` is async and awaits `cancelQueries`, so its write lands a tick later.
- `src/services/todos/useTodoDrop.ts` — a mutation. `applyTodoMoved` (in `todos/cache.ts`, with the rest of the cache functions) sets `column_id` and `rank` on **one** row and passes every other card through by reference; the hook writes that optimistically and restores its snapshot if the write fails. It builds a new object for the moved card rather than assigning in place — the old in-place `todo.position = index` mutated the very rows the cache was holding, which is why a rollback would have had nothing to restore. It takes the rank rather than computing one, because the sender already chose it and recomputing on the receiving side would put the card somewhere else on every client.

Droppable `data.type` is the dispatch key throughout: `"column" | "column-gap" | "todo-gap"`. Adding a drop target means adding a type here and handling it in `handleDragOver` + `collisionDetection`.

**Auth.** `AuthProvider` (`src/providers/`) owns the auth state: one `getSession()` and one `onAuthStateChange` subscription per page load, mounted in `main.tsx` _above_ `QueryClientProvider`. That subscription is also where `queryClient.clear()` runs on `SIGNED_OUT`, so the cache is dropped however the session ends — logout button, token expiry, or a sign-out in another tab. It imports the module-level `queryClient` deliberately: `useQueryClient()` has no client in context that high up. `useAuth` just reads that context and throws outside the provider; it still returns `{ user, loading }`, so every call site shares one `loading` flip. The context itself lives in `providers/authContext.ts` — split out because react-refresh cannot fast-refresh a module that mixes a component with other exports (same reason as `themeContext.ts`). Routes in `components/routes/` gate on it; the pages they render live in `src/pages/` (`auth/`, `board/`, `error/`, `profile/`) since M2-19, and the board is routed as `/boards/:boardId` with `useBoardId()` reading the param. `signUp` in `authApi.ts` calls the `provision_new_user` RPC rather than seeding rows itself — the old client-side sequence could half-create an account if it failed between steps, and nothing repaired it.

**Column management.** `components/columns/` owns everything a column can do: `ColumnHeader` picks one of four header states (transition pills / "Transition to..." / inline rename / normal), `ColumnMenu` is the three-dot menu, and the modals handle limits and deletion. `KanbanBoard` still holds which columns are collapsed (client-only, not persisted); which column each modal targets moved to `src/hooks/useBoardModals.ts` (M2-18), which holds the column itself rather than an id so a modal is open exactly when it has a target. Deleting a column rehomes its todos server-side first (`deleteColumn` in `columnsApi.ts`), so the delete modal always makes you pick a destination and the option is hidden when only one column is left.

**Column limits.** `min_limit`/`max_limit` are nullable and advisory — `limitBreach()` turns a breach into the header's warning text and nothing more. They never block a drop — nothing in `onDragEnd` or `useTodoDrop` consults them. The header renders the breach as a tooltip trigger, so the text lives in its `aria-label`, not in the DOM text. Schema in `supabase/migrations/`.

**Column categories.** `columns.category` is a checked text field (`'todo' | 'in_progress' | 'done'`) — a fixed set users pick from, never define, so there is no lookup table. The palette lives in `src/constants/columns.ts`, not the DB: colours are presentation, so retuning them is an edit rather than a migration. `categoryOf()` falls back to `todo`, so a row with a null category still renders.

**i18n.** `src/components/i18n/` (en/ru/uz, language in `localStorage`). Column **titles are never translated** — they are user-editable text and render raw through `columnTitle()`. Running them through `t()` was a bug (M2-20): renaming a column to "todo" made it render as a translation key. What *is* translated is the column's category, via `categoryLabelKey(category)` → `columnCategory.<category>`, which is a fixed set the user picks from and never defines.

**Theme.** `ThemeProvider` (`src/providers/`, beside its `themeContext.ts`) toggles a `dark` class on `<html>`; the `@custom-variant dark` in `src/styles/global.css` keys off it. All design tokens are CSS vars in that file.

## Gotchas

- `@/` → `src/`, declared in both `vite.config.ts` and `tsconfig.app.json`. Existing imports mix `@/` and relative paths freely.
- Vendored shadcn primitives (`button`, `input`, `tooltip`, `dropdown-menu`, `sheet`, …) live in `src/components/ui/` and are built on `radix-ui` + `@base-ui/react`. `src/components/ui/SideBarUI/` holds only `sidebar.tsx` and its `use-sidebar.ts` — that folder is the sidebar, not a UI kit. `components.json` aliases are correct now, so `npx shadcn add` lands in `ui/` importing `@/utils/cn`.
- `noUnusedLocals`/`noUnusedParameters` are on, so an unused import fails `npm run build` even though the dev server is happy.


The user is actively learning software engineering.

Do not unnecessarily implement everything autonomously.

For non-trivial architectural changes:
1. Explain what we are building.
2. Explain why it is needed.
3. Explain the relevant existing code.
4. Explain important trade-offs.
5. Propose the implementation.
6. Wait for approval before making significant changes.

Prefer teaching and code review over blindly writing large amounts of code.

The user should understand the architecture and be able to explain the implementation themselves.