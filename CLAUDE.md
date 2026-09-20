# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code comments

Minimize comments. Write a comment **only** where a competent developer could
not understand the code without it — a non-obvious constraint, a workaround for
a bug or API quirk, a deliberate choice that looks wrong, a security-critical
reason invisible in the code. Only extremely necessary comments are allowed.

Never write comments that restate the code, section banners, JSDoc on
self-explanatory functions, tutorial commentary, or notes about future
milestones. If a comment is needed to explain *what* the code does, rename
things or split the function instead. Explanations belong in the chat response,
not in the file.

## Commits

Do **not** add a `Co-Authored-By: Claude ...` trailer to commit messages. The
history was rewritten on 2026-08-29 to strip 113 such trailers so Claude stops
appearing in the GitHub contributors list; re-adding one puts it back.

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

`README.md` describes the product and how to run it; it keeps the React Compiler note M9-04 wrote. **The React Compiler is not enabled and its plugin is gone** (measured: 2.7x build time, +25% on the board chunk, against an unprofiled saving). `vite.config.ts` records why; M9-05 is the trigger to revisit.

Requires `.env` with `VITE_API_URL` (gitignored; `.env.example` is the template). `src/services/api/client.ts` throws at module load if it is missing. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are still read by `src/services/api/supabase.ts`, which also throws without them — placeholders suffice unless you need realtime, attachments or avatars, the three surfaces B9/B10 have not migrated. Vite inlines all three at build time, so a missing variable is a rebuild, not a redeploy.

## The backend

`backend/` is a separate npm project — Node 24, Express 5, Prisma 7 over `pg`, its own `package-lock.json`, its own `tsconfig`. One folder per feature under `backend/src/modules/`, each holding `<feature>.routes.ts` · `.controller.ts` · `.service.ts` · `.repo.ts`; `backend/src/modules/CONVENTIONS.md` is the rule for what belongs in which. Everything versioned mounts under `/api/v1` (`backend/src/app.ts`); `/health` sits outside the prefix on purpose, so an uptime check does not track the API version.

```bash
cd backend
npm run dev                # tsx watch
npm run build              # tsc
npm test                   # vitest — stubs its own env, needs no database
npm run test:integration   # *.int.test.ts against a real DB, needs TEST_DATABASE_URL
npm run db:migrate         # prisma migrate deploy
npm run db:generate        # regenerate the client — required before tsc, which typechecks against it
npm run db:seed-demo -- --confirm   # development-only demo data (see below)
```

`db:seed-demo` fills the database it is pointed at with a realistic
organisation — ~39 people, 6 spaces, 14 boards, ~2 500 work items, ~2 400
comments and ~6 000 activity rows spread across thirteen months, so every one
of M34's six reporting periods answers with a different, meaningful number.
It writes through the real schema, so what the UI renders is what the
application would really hold, and its output is **deterministic**: one fixed
seed, so a bug found in one run is still there in the next.

It refuses to run without `--confirm`, refuses `NODE_ENV=production`, and
refuses any database whose name ends in `_test` or `_bench` — those belong to
the integration suite and to `seed-benchmark.ts`. It is **additive and
idempotent**: it deletes only the accounts it created (`*@veylo.demo` plus the
demo superadmin) and lets the cascades take their boards with them, so an
account you made by hand survives and a second run does not double the data.
Sign in as `superadmin@gmail.com` / `123123123123`.

It inserts with triggers disabled, which is what makes it seconds rather than
an hour — so it has to satisfy by construction the invariants the triggers
would otherwise maintain: `completed_at` is set exactly for cards in a `done`
column, and a board's owner owns the space it is filed into
(`boards_space_ownership`). Getting the second one wrong is what made every
board render as "Unfiled".

Authorization is middleware, not RLS: `requireAuth` → `boardAccess()` resolves the board and the caller's membership → `requireRole(...)` gates the verb. `accessibleBoardIds` is the single swap point the old `accessible_board_ids()` helper used to be. `backend/src/lib/errors.ts` owns the `ErrorCode` union and pairs each code with its status in one table, so a call site cannot invent a 404 `conflict`.

**The connection pool pins its session to `timezone=UTC`, and that is load-bearing.** Prisma's pg adapter reads a `timestamptz` from the session's own rendering and labels the result UTC, so against a PostgreSQL server running at any other offset every timestamp the API returned was wrong by that offset — an activity finished at 19:45 reached the browser as 00:45 the next day, and the board feed filed it under tomorrow. Setting `TZ` on the Node process does not help; the offset comes from the database session. `backend/src/db/client.ts` records the measurement. Nothing else depends on the session zone: every admin aggregate names its own zone with `AT TIME ZONE`, and `now()` is an instant either way.

`docker compose up --build` runs frontend, API and PostgreSQL together; see `README.md`. `docker-compose.yml` sets `NODE_ENV=development` deliberately — `backend/src/config/env.ts` refuses to start in production without TLS cookies, SMTP and email verification, none of which a local demo has.

## Database migrations

The schema lives in `backend/prisma/schema.prisma` and its migrations in `backend/prisma/migrations/`. `prisma.config.ts` supplies the datasource URL from `DATABASE_URL`; the `datasource` block carries no `url`.

```bash
cd backend
npm run db:migrate   # prisma migrate deploy — applies what is pending
npm run db:status    # what is applied and what is not
npm run db:generate  # regenerate @prisma/client after a schema change
```

Migrations are forward-only: there is no `down`. Reversing means writing a new migration. Expand → backfill → contract, one migration each, never combined.

`supabase/migrations/` is the **historical** schema from before B5–B8 and is not applied by anything. It survives because B9 and B10 have to port its realtime publication and storage-bucket rules. Do not add to it.

## Architecture

Vite + React 19 + TypeScript on the frontend, an Express + Prisma API on PostgreSQL behind it, TanStack Query as the only real state layer, Tailwind v4 (CSS-first, no tailwind.config), `@dnd-kit/core` for the board.

**Data flow.** One folder per feature under `src/services/`: `todos/`, `boards/`, `columns/`, `auth/`, `profile/`, `spaces/`, `members/`, `invites/`, `comments/`, `activities/`, `notifications/`, `forYou/`, `realtime/`, `views/`, `sprints/`, `attachments/`, each holding its `<feature>Api.ts` (the HTTP calls, all of them through `services/api/client.ts`) next to the `use*.ts` hooks that wrap it. Components consume the hooks and import them by path — there is no barrel. The two exceptions are `services/api/client.ts` — the shared fetch wrapper that owns the access token, the 401-retry and refresh-token rotation — and `services/queryClient/`. `services/api/supabase.ts` is the fading third: only realtime, attachments and avatars still import it, pending B9/B10. Every key is board-scoped and comes from the factory in `src/services/queryClient/queryKeys.ts` — `queryKeys.todos(boardId)` (one flat array for the whole board, not per-column), `queryKeys.columns(boardId)`, `queryKeys.boards()` for the index, `queryKeys.board(boardId)` for one board's own row, `queryKeys.members(boardId)`, `queryKeys.invites(boardId)`, `queryKeys.activities(boardId)`, `queryKeys.sprints(boardId)`, `queryKeys.comments(todoId)`, `queryKeys.attachments(todoId)`, `queryKeys.todoActivities(todoId)`, `queryKeys.todo(todoId)`, `queryKeys.profile(userId)`, and the non-board-scoped `queryKeys.forYou()` / `queryKeys.notifications()` families, which answer "what is mine" across every board the API lets the caller reach rather than "what is on this board". No key is spelled out anywhere else. `boardId` is a *required* argument even though it may be `undefined`: making it required is what turned "find every place that reads the board" into a compiler error instead of a grep, and `undefined` is a real state — the route param before it resolves — keying an entry whose query is disabled. `useTodosByColumns` buckets cards into columns client-side and deliberately does *not* order them — `useVisibleTodos` has already put the array in display order, and sorting again there is what made the board and the list two implementations of one rule. It does apply one rule of its own, `isOnBoard` — see *Sprints and the Backlog*. Most mutations optimistically patch the `["todos", boardId]` cache rather than invalidating. *How* they patch it lives in `services/todos/cache.ts` and `services/columns/cache.ts`, not in the hooks: pure `(rows, …) => rows` functions (`applyTodoInserted` / `Updated` / `Deleted` / `Moved` and the column equivalents), each with a `cache.test.ts` sibling. They are outside the closures deliberately — M6-B's realtime handlers (`services/realtime/events.ts`, one channel per board via `useBoardRealtime`) apply the same transformations to the same array when the change arrives from another client, and a channel callback cannot reach into an `onMutate`. None of them mutates its input: `onMutate` snapshots the cached array for rollback and the cache holds those very objects, so renumbering in place would leave `onError` nothing to restore. The client's defaults live in `queryClient.ts`: a 30s `staleTime` (so a tab switch is not a board refetch), a 10min `gcTime`, no retries on mutations, and `retryPolicy.ts` for queries — which retries only 408, 429, 5xx and errors with no status at all (a dropped fetch), because a 403 or a 404 fails identically every time and retrying it three times only delays the message. Failures surface centrally from that same file: the `MutationCache` toasts every rejected mutation, the `QueryCache` toasts only a failed *refetch* (a failed first load is already rendered by the component that owns the query). Opt out with `meta: { silent: true }` — typed through a `Register` augmentation — rather than adding a per-mutation error toast. Render throws are a separate path: `components/ErrorBoundary.tsx` wraps each column's card list so one bad card costs that list and nothing else, and every route carries an `errorElement` as the outer net.

**Boards own everything (M2).** A board is the unit of ownership: `boards.owner_id` references `profiles`, and `columns.board_id` / `todos.board_id` are `NOT NULL` with foreign keys. The API says so too — every board-scoped route goes through `boardAccess()`, which resolves `:boardId` to the caller's membership before the handler runs, and `accessibleBoardIds` is the single place "which boards can this person see" is decided. `user_id` is **gone** from both tables; authorship survives as `todos.creator_id`, which has no `auth.uid()` default, so `addTodo` sends it explicitly. `todos.completed` is gone as well — doneness is derived from the column's `category === 'done'`, and there is no second source of truth. `todos.id` is a **uuid the client mints** (`crypto.randomUUID()`), which is why the optimistic row and the stored row are the same row and there is no `isOptimistic` flag; `addTodo` upserts rather than inserts, so a racing `reorderTodos` cannot strand a half-written row. Cards are labelled `KAN-{todos.board_key}`, a per-board counter allocated by a `BEFORE INSERT` trigger from `boards.next_key` — not the row id, which is unreadable. Keys are never reused: deleting KAN-2 and creating another card gives KAN-4. `board_key` is null for the moment a card is in flight, and that absence is the pending state.

New users are provisioned server-side by `backend/src/modules/auth/auth.service.ts`, not by the client: it creates the profile, the space, the board and the four default columns in one transaction and is idempotent, so a retried signup cannot mint a second board.

**Ordering (ranks, since M6-A).** Both todos and columns carry a `rank` — a `double precision` sort key, not a sequence position. A move computes one value *between* the two neighbours it lands amongst (`rankBetween` / `rankForDrop` / `rankForAppend` in `src/utils/rank.ts`) and writes **one row** (`moveTodo`, `moveColumnRank`). That single-row write is the point: the old dense-integer scheme renumbered whole columns from each client's own snapshot and wrote the entire array, so two people dragging at once overwrote each other's cards — including cards neither had touched.

A third surface joined them in M29: `todos.backlog_rank`, the Backlog view's own order, is the same fractional scheme as a *separate value* (`src/utils/backlogRank.ts`, comparator `byBacklogRank`). A card's place in a Kanban column and its place in a sprint's planning list are different questions, so they get different columns — which is also why the Backlog can be a second reordering view without reopening M6-A: it never writes `rank`.

`byRank` is the comparator both features sort with, in `src/utils/rank.ts`. It falls back to `position * RANK_GAP` when a rank is missing, which is why a row written by an older client still sorts where it belongs. The dense integer `position` column still exists as a lazily-updated mirror; nothing reads it for ordering except that fallback.

Doubles run out of room between two neighbours eventually — `rankBetween` returns `null` and the caller rebalances the column (`rebalanceColumnRanks` / `rebalanceBoardColumnRanks`). `reorderTodos` survives for exactly one job: `useAddTodo` correcting the positions of a column after a mid-column insert.

**Drag and drop is hand-rolled, not `@dnd-kit/sortable`.** Nothing in the board reflows while dragging; only the `DragOverlay` moves. The pieces:

- `src/hooks/useKanbanDnd.ts` — sensors, a custom `collisionDetection` that ignores rect intersection and picks the _gap nearest the pointer_, and the two indicator states.
- `DropZone` / `ColumnDropZone` — always-mounted droppables sitting _between_ cards/columns, ids `todo-gap:<columnId>:<index>` and `column-gap:<index>`. They exist to be measured, and paint a blue line when they're the nearest gap. Each also carries `beforeId`/`afterId` (its two neighbours) so `collisionDetection` can drop the hit when the gap touches the dragged item — otherwise the indicator would offer a no-op drop around the item itself. Idle, `DropZone` doubles as the create affordance (hover → `+` → `TodoCreateForm` opens at that index).
- `src/hooks/useBoardDragEnd.ts` — the whole `onDragEnd` body, extracted from `KanbanBoard`'s JSX (M2-17). Column branch calls the `moveColumn` it is handed; todo branch delegates to `useTodoDrop`. It also derives the cross-column transition state (`activeTodo.column_id` vs `indicator.columnId`) and returns the `isDragSource` / `transition` inputs that swap the headers and highlight the destination. Same-column drags are pure reordering, so `transition` stays null there. `KanbanBoard.tsx` only wires the result to `<DndContext onDragEnd={…}>`.
- `src/hooks/useColumnReorder.ts` — supplies that `moveColumn` (M2-18): `applyColumnMoved` + a cache write + `reorderColumns`. It writes the cache itself *and* the mutation's `onMutate` writes it again; the two are not redundant, because `onMutate` is async and awaits `cancelQueries`, so its write lands a tick later.
- `src/services/todos/useTodoDrop.ts` — a mutation. `applyTodoMoved` (in `todos/cache.ts`, with the rest of the cache functions) sets `column_id` and `rank` on **one** row and passes every other card through by reference; the hook writes that optimistically and restores its snapshot if the write fails. It builds a new object for the moved card rather than assigning in place — the old in-place `todo.position = index` mutated the very rows the cache was holding, which is why a rollback would have had nothing to restore. It takes the rank rather than computing one, because the sender already chose it and recomputing on the receiving side would put the card somewhere else on every client.

Droppable `data.type` is the dispatch key throughout: `"column" | "column-gap" | "todo-gap"`. Adding a drop target means adding a type here and handling it in `handleDragOver` + `collisionDetection`.

**Work item hierarchy (M27/M28).** Three levels — **Epic → Task → Subtask** — modelled as one self-referencing `todos.parent_id`, not a second table: an Epic needs a key, a title, an assignee, comments, activity and realtime, and that is `todos`. A row's *role* is read from its parent, never from its own `type`: a row with no parent is top level, a row under an Epic is a Task whatever its type says, and a row under anything else is a Subtask. `enforce_work_item_hierarchy` (a `BEFORE INSERT OR UPDATE` trigger) is the single place that rule lives — it refuses an Epic with a parent, a Subtask under a Subtask, a Subtask that has children of its own, a cross-board parent, and a Subtask carrying its own `sprint_id`. Nothing in React re-checks it. `type` is a checked text field (`Task | Bug | Story | Feature | Epic`) — there is no `Subtask` type, because being a subtask is structural. Client helpers live in `services/todos/subtasks.ts`; `useVisibleTodos` calls `topLevelTodos()` **first**, so a genuine Subtask never reaches any view, and every surface got that for free.

**Sprints and the Backlog (M29/M30).** A sprint is a container with a lifecycle (`future → active → completed`), not a work item — so it is its own `sprints` table rather than a `todos.type`, and `sprints_one_active_per_board` (a partial unique index) is what guarantees at most one is running. Read the running one through `services/sprints/activeSprint.ts`; nothing should re-derive it. Transitions are their own endpoints (`POST /sprints/:id/start`, `/complete`) rather than field updates, because each is more than one write — starting bulk-assigns the board's first `todo`-category column to whatever the sprint holds without one; completing rehomes unfinished work — and a function body is one transaction where two client writes are not. Deleting a sprint is an ordinary `delete`: `todos.sprint_id` is `on delete set null`, so the work returns to the Backlog by itself.

**`column_id` and `sprint_id` are independent axes, and conflating them is a known trap.** `column_id` answers *is this on the Board?*; `sprint_id` answers *is this planned into a Sprint?*. `isOnBoard` (`services/todos/backlog.ts`) is the one place board membership is decided: a card needs a column, and is withheld only when committed to a sprint that is **not** the running one. A card with no sprint is on the board on its `column_id` alone — which is what keeps pre-sprint work and ad-hoc cards visible. A pass in M31-C made membership require the active sprint instead, and it emptied every board and made every newly created card invisible; the migration header had predicted exactly that. `useAddTodo` stamps the active sprint itself so no create surface has to remember to.

**Estimates (M24).** `todos.estimate` is `numeric`, story points rather than hours, constrained only to `>= 0` — the scale is a Fibonacci quick-pick in the control, not a CHECK, so disagreeing about the scale is an edit rather than a migration. `null` and `0` are different answers and the rollups in `services/todos/sprintPoints.ts` count unestimated items separately. It is **not** yet a `SORT_KEYS` entry.

**Attachments (M32).** Files on a work item: metadata in `attachments`, bytes in the **private** `task-attachments` bucket, paired by a UNIQUE `storage_path`. The row is board-scoped like `comments` — `board_id` as the one-hop policy key, pinned by the composite FK to `todos (id, board_id)` on cascade — and it is **immutable**: there is no `updated_at`, no UPDATE policy and no UPDATE grant, so a rename is a delete and a re-upload. `uploader_id` is `on delete set null` rather than `comments.author_id`'s cascade, because a file is a contribution to a shared work item rather than one person's words. **Uploading is editor and above (`canAttach`), not the comment matrix** — a viewer reads and downloads every file and adds none; that is the one place attachments and comments deliberately disagree, and `services/members/permissions.ts` records why. Deleting is the uploader plus admins and owners, `canDeleteComment`'s shape.

**Previewing is the one narrow reopening of that containment (M32-B).** A row renders an image's own thumbnail and clicking the thumbnail or the name opens `AttachmentPreview`, a lightbox portalled to `document.body` at `z-[60]` — the task modal's panel is `overflow-hidden` and `z-50`, so anything rendered inside the section would be clipped and outranked. Download and Delete moved into a per-row three-dot menu (`useCardPopover`, the same panel `TodoMenu` uses), which is also what stops a click aimed at a preview landing on a destructive action. A preview URL is the only link in the feature that omits `download`, so **`previewKind` in `fileMeta.ts` is the gate and only two families pass it**: images, which render in an `<img>` and therefore in a script-free context, and PDFs, which render in an `<iframe>` and are a judgement rather than a guarantee — both functions carry the reasoning. Everything else gets a fallback card with a download button, which is exactly what it had before. Thumbnails come from `signedPreviewUrls`, one `createSignedUrls` call for the whole list rather than one per row, cached by `useAttachmentPreviews` and keyed by the paths themselves so uploading or deleting changes the entry. There is **no server-side resizing** — image transformation is a Pro-plan feature and this project is not on one — so the full object is fetched and the browser scales it; `loading="lazy"` and the preview reusing the same URL are what blunt that.

**The section is a shell over three modules (M32-C).** `AttachmentsSection.tsx` owns the header, the selected tab, the layout and which file the preview is open on; `AttachmentItem.tsx` owns one file's row, card, menu and confirmation; `services/attachments/attachmentFilter.ts` owns the five-tab taxonomy (All · Images · Documents · Videos · Other), built on `fileKind` so the icon and the tab can never disagree, with tests pinning that the four categories sum to the total; `useBulkAttachments.ts` owns Download all and Delete all. Both bulk actions operate on **what is on screen**, not on everything, because the count sits on the menu item. Download all is a staggered series of anchors rather than a zip — a client-side archiver is a dependency that would hold every file in memory — and each file needs its own signed URL, because the plural `createSignedUrls` can only name the object's own uuid key as the download name. Delete all repeats `useDeleteAttachment`'s object-then-row order per file, sequentially, so a failure part-way leaves a determinate set gone. **Every confirmation in this panel is inline**, and not only on `CommentThread`'s no-dialog-over-a-dialog rule: `ui/Modal` dismisses on a bubble-phase `document` keydown and `TaskDetailModal` registered its listener first, so Escape in a nested dialog would close the task too.

The object key is `<board_id>/<todo_id>/<attachment_id>.<ext>` and **carries no user-supplied text** — the storage policies read the first segment as the board, so a filename that could inject a `/` would let an uploader nominate a different one. `services/attachments/fileMeta.ts` builds it and its test pins that. Reads are `createSignedUrl` with a `download` option, never `getPublicUrl`: the bucket has no mime allow-list, so forcing `Content-Disposition: attachment` is what stops an uploaded `.html` executing on the storage origin. **The object is written before the row and deleted before the row**, on both paths, because the storage DELETE policy finds an object *through* its row — reversing the order is what makes permanent invisible orphans, where this order fails to a visible broken row. The one orphan case left is cascade (deleting a todo or board drops rows and leaves objects); the sweep query is in the migration header and runs as `service_role`. No realtime and no `cache.ts` — the latter exists elsewhere only because a realtime callback cannot reach into an `onMutate`, and there is no such callback here.

**Views (M16, extended through M31).** Six renderings of one pipeline — `summary`, `board`, `list`, `calendar`, `timeline`, `backlog` — declared as values in `services/views/registry.ts` with the capabilities each has (`canReorder` / `canGroup` / `canSort`), so "does this view write order?" is a lookup rather than a code review. `useVisibleTodos` is the single pipeline (scope → filter → search → sort) every one of them reads, which is why filter and search apply whichever view is open. Two views reorder — Board writes `rank`, Backlog writes `backlog_rank` — and `registry.test.ts` pins that set.

**Auth.** The access token lives in a module variable in `services/api/client.ts` — never `localStorage`, so nothing can read it out of the document. The refresh token is an HttpOnly cookie scoped to `Path=/api/v1/auth`, and `client.ts` spends it on a 401 and retries the request once; `navigator.locks` plus a `BroadcastChannel` mean many tabs produce one refresh, not one each. `AuthProvider` (`src/providers/`) owns the React-visible state, mounted in `main.tsx` _above_ `QueryClientProvider`: it subscribes through `services/auth/session.ts` and calls `refreshSession()` then `fetchMe()` on mount, because a reload always starts with no token in memory. `queryClient.clear()` runs whenever that subscription reports `null`, so the cache is dropped however the session ends — logout button, dead refresh token, or a sign-out in another tab. It imports the module-level `queryClient` deliberately: `useQueryClient()` has no client in context that high up. `useAuth` just reads that context and throws outside the provider; it still returns `{ user, loading }`, so every call site shares one `loading` flip. The context itself lives in `providers/authContext.ts` — split out because react-refresh cannot fast-refresh a module that mixes a component with other exports (same reason as `themeContext.ts`). Routes in `components/routes/` gate on it; the pages they render live in `src/pages/` (`auth/`, `board/`, `error/`, `profile/`) since M2-19, and the board is routed as `/boards/:boardId` with `useBoardId()` reading the param. `signUp` in `authApi.ts` posts to `/auth/register` and lets the API provision the account in one transaction rather than seeding rows itself — the old client-side sequence could half-create an account if it failed between steps, and nothing repaired it.

**Column management.** `components/columns/` owns everything a column can do: `ColumnHeader` picks one of four header states (transition pills / "Transition to..." / inline rename / normal), `ColumnMenu` is the three-dot menu, and the modals handle limits and deletion. `KanbanBoard` still holds which columns are collapsed (client-only, not persisted); which column each modal targets moved to `src/hooks/useBoardModals.ts` (M2-18), which holds the column itself rather than an id so a modal is open exactly when it has a target. Deleting a column rehomes its todos server-side first (`deleteColumn` in `columnsApi.ts`), so the delete modal always makes you pick a destination and the option is hidden when only one column is left.

**Column limits.** `min_limit`/`max_limit` are nullable and advisory — `limitBreach()` turns a breach into the header's warning text and nothing more. They never block a drop — nothing in `onDragEnd` or `useTodoDrop` consults them. The header renders the breach as a tooltip trigger, so the text lives in its `aria-label`, not in the DOM text. Schema in `backend/prisma/schema.prisma`.

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