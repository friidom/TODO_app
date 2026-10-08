# Jira UX blueprint

Planning document for a Jira-style UX pass. It is based on the 13 reference screenshots in `jira_design_samples/` and a read-through of the code listed in §2.

Written 2026-10-08. Nothing in it is implemented yet.

---

## 1. Executive summary

- **Almost all of this is frontend work.** Nothing below needs a backend change, a migration or a new query key. All 12 features have a real version built on data the app already loads.
- **Issue side panel.** It goes in `ViewShell`'s existing `drawer` slot, beside the board, and reuses the modal's task body as-is. Modal or panel is a choice saved on this device.
  - It must **not** be built on `Drawer`. `Drawer`'s Escape handler closes without asking about unsaved edits. The project hit exactly this bug in M17 (see `docs/IMPLEMENTATION_PLAN.md`).
- **Sprint insights and View settings** become two new `?panel=` drawers. The `usePanel` + `Drawer` setup is already there; they only need two new values.
- **Saved on this device, not shared.** View settings, subtask columns and collapsed cards are stored in `localStorage`, the way List columns and toolbar order already are. Sharing them across a board would need a new `boards` column, so that's future work.
- **Best value for the effort:**
  - Make section headings title case, like Jira. This is a single class string, `SECTION_TITLE`.
  - Collapsible cards.
  - Drag-and-drop file upload.
  - Quick-reply chips under the comment box.
  - Assignee avatars in the toolbar.
  - Column size and scrolling options.
- **Out of scope, each needs backend work:**
  - Watchers and sharing to a person
  - Automation
  - Linked work items
  - Work log
  - Flagged/blocked items
  - Bulk edit and "View in search"
  - Labels and Team fields
  - View settings shared across a board
- **i18n goes first, not last.** `locales.test.ts` fails as soon as en, ru and uz have different keys. All new strings therefore go in during Phase 0.
- **Size:** about 13 new files and 22 edited ones, in 6 phases. Each phase leaves the app building and the tests passing.

---

## 2. Current architecture findings

**Task detail** — `src/components/todo/TaskDetailModal.tsx` (695 lines)
- **How it opens:** `useOpenTask` reads `?task=`. A short exit animation runs before close (`useClosingValue`, 150 ms).
- **Modal shell (`Overlay`, L94–171):** a fixed backdrop at `z-50` with a dialog of `w-[min(1100px,100%)] h-[min(46rem,100%)]`.
- **Escape (L111–122):** a document-level bubble listener that does nothing if a popover already handled the key (`defaultPrevented`).
- **`Body` (L173–500):**
  - **Unsaved-edit guard:** if the title or description is mid-edit, closing shows a confirmation bar first (wired through `requestCloseRef`).
  - **Layout:** two columns at `md:` — the main column plus a `md:w-[20rem]` side column (the aside).
  - **Viewers:** the aside gets `pointer-events-none`.
  - **Contents:** the Details section isn't collapsible. The aside also holds `DevelopmentActions` as a collapsible card.
- **Where it's used:** mounted only in `src/pages/board/BoardPage.tsx`.
- **History:** this used to be a drawer panel (M17) before it became this modal. The comment on L56 explains why.

**Task sections**
- **`SectionHeader.tsx`:** the chevron sits *after* the title. `SECTION_TITLE` (`detailChrome.ts:3`) is small caps (11px uppercase, `ink-3`). Only task-detail headings use it.
- **Attachments (`AttachmentsSection.tsx`, `AttachmentItem.tsx`):** collapsible, with type filter tabs, list/grid views, per-file pending/failed rows, inline confirmations, a preview lightbox at `z-[60]` and menus at `z-[70]`.
  - **There is no native file drag-and-drop or paste-to-upload anywhere in `src/`.**
  - Uploads go through `useUploadAttachment` and aren't optimistic.
- **Subtasks (`SubtasksSection.tsx`):** data comes from the board's cached todos (`useSubtasks`), with no request of its own.
  - **Today:** a green progress bar and a grid of `3.75rem|1fr|1.5rem|1.5rem|7.5rem` with icon-only controls. `AddSubtaskRow` has an input and a Done button: Enter adds and stays open, Escape cancels, blur submits.
  - **Missing:** "Choose existing", column config and the ⋯ menu.
- **`EpicTasksSection.tsx:305` (`ExistingTaskPicker`):** already re-parents existing cards through `useUpdateTodo`. That's the pattern to copy for subtasks.
- **Hierarchy rules** live only in the DB trigger `enforce_work_item_hierarchy` (migration 0006). It refuses:
  - a subtask that has children
  - a subtask under a subtask
  - **a subtask with its own `sprint_id`**
  - a parent on another board
  - an Epic with a parent
- **`CommentThread.tsx` (`Composer`, L302–362):** a textarea, a Comment button and a "⌘↵ to post" hint. No chips, shortcut or avatar.
- **`ActivitySection.tsx`:** underline tabs. The Work log tab honestly says it isn't available yet.
- **Development:** a list in the main column plus the actions card in the aside. Both read `useDevelopment` with the same query key, so there's one request.

**Board shell**
- **Layout:** `BoardPage` renders `Layout`, then `ViewShell` (identity, tabs, toolbar, the view, and a `drawer` slot), plus `TaskDetailModal`.
- **`usePanel.ts`:** handles `?panel=members|activity`. `openPanel` **removes `task`**, so only one right-hand surface is open at a time.
- **`Drawer.tsx`:** sits beside the board at `xl` (`xl:static xl:w-[22rem]`) and overlays it with a scrim below that. It has its own document Escape listener.
- **`ViewToolbar.tsx`:**
  - Labels collapse by container width.
  - The `search`/`filter`/`group`/`sort` slots can be dragged to reorder (`ReorderContext`, saved to `localStorage`).
  - The right-hand group is `SprintControls` (board view only), `BoardActions` (Activity button and ⋯ menu) and `HeaderTodoForm`.
- **Filters are URL state in `useBoardView`.** Assignee values are `me`, `none` or member ids. `toggleFilter`, `clearFilters` and `filterCount` already exist. `FilterPopover` already has an assignee pane, and lists you as "Assigned to me" (`me`) rather than by id.

**Board layout and scrolling** — `KanbanBoard.tsx:282`
- **Structure:** the scroll box is `-mx-3 min-h-0 flex-1 overflow-x-auto pb-4`, containing a row of `flex h-full min-w-max`.
- **Columns:** each is `w-[264px]` (`COLUMN_WIDTH`) and `h-fit max-h-full`, and its card list scrolls on its own. That is today's "scroll within columns".
- **The flex item is `SortableColumn`'s wrapper div**, not the `KanbanColumn` root.
- **Swimlanes** have their own `overflow-auto` scroll box.
- **Drag auto-scroll** covers both axes (thresholds x 5%, y 10%).
- **No scroll or resize measuring exists yet** (no `ResizeObserver` anywhere).
- **Cards (`TodoCard.tsx`)** already have hover actions (rename, ⋯), a selected ring (`selected={taskId === todo.id}`, set in `KanbanColumn.tsx:295`) and the done flash.

**Sprints**
- **`SprintDetails.tsx`** (the gauge popover) already computes:
  - done / in progress / to-do counts
  - % complete
  - days left
  - story points, through `sprintPoints`
- **Other helpers:** `activeSprintOf` and `epicTaskProgress` exist.
- **Completion timestamps:** `completed_at` is set when a card enters a done status and cleared when it leaves (migration 0026). That's enough for an approximate burndown.
- **Charts:** `TrendsChart.tsx` is hand-drawn SVG; there's no chart library, on purpose.

**Data:** TanStack Query, with every key built in `queryKeys.ts`. The board loads its todos once (`["todos", boardId]`) and every view derives from that. **None of these features needs a new request.**

**Permissions** — `usePermissions()`, a UI mirror of the server's rules:

| Permission | Who has it |
|---|---|
| `canEditTodos` | editor and above |
| `canAttach` | editor and above |
| `canComment` | any member |
| `canEditBoard` | admin and above |

**i18n** (`locales.test.ts`)
- ru and uz must have exactly en's keys.
- **Any string literal in the source shaped like `"namespace.key"` must exist in en, including literals inside comments.**
- Russian plurals need `_one/_few/_many/_other`.
- uz is written in Latin script.

**UI building blocks**
- **`useCardPopover`:** positions popovers with floating-ui and fades them in/out (160/120 ms). Its Escape runs in the capture phase and marks the key handled, so the task modal doesn't also close. Its panels carry a `data-card-popover` marker.
- **Chrome, controls and primitives:** `POPOVER_PANEL`, `MENU_ITEM`, `MENU_LABEL`, `IconButton` (tooltip + `active`), `ToolbarButton`, `HEADER_CONTROL*`, `SEGMENTED/SEGMENT*`, `TEXT_FIELD`, `INLINE_ACTION*`, `TABLE*`, `COUNT_CHIP`, `HOVER_REVEAL`, `Avatar`, `Tooltip`, `EmptyState`, `Skeleton`.
- **Animation:** `tw-animate-css` for `animate-in`, plus a global rule that switches motion off under reduced-motion.
- **Colour:** the brand colour is purple. Wherever Jira uses blue for "selected", use `brand` / `brand-soft`.
- **Class merging:** `src/utils/cn.ts` is tailwind-merge extended with the project's text, radius and shadow tokens. A new token in `global.css` must be registered there too (this plan adds none).
- **Saved preferences:** zustand stores, each with pure read/write/normalize helpers and tests in `services/views/*.ts` (`toolbar.ts` and `listColumns.ts` are the pattern).

**Tests:** Vitest, plain TypeScript only, no React Testing Library. Tests sit next to the code as `*.test.ts`, and `tsc` type-checks them.

**Gotchas found**
1. **Board text inputs don't mark Escape as handled:** `TodoCreateForm.tsx:94`, `ColumnHeader.tsx:275`, `BoardSearch.tsx:58`, `ViewTabs.tsx:453`, `HeaderTodoForm.tsx:86` and others.
   - The modal covers them, so today it doesn't matter.
   - **With a side panel open, they'd close the panel.**
2. **Every card re-renders on any URL change.** Each card calls `useOpenTask()`, which reads `useSearchParams` (this predates this work). Don't add more URL reads inside cards.
3. **Class order can cancel the `active` look.** `cn()` uses tailwind-merge, so a later `bg-transparent` in `className` wins. The Activity button in `BoardActions` already loses its active background this way.
4. **Uncommitted work may be in the tree:** the GitLab Development card (11 files) and the untracked `jira_design_samples/` folder. Build on top of it and don't revert it.
5. **Pre-existing problems to leave alone:**
   - the lint error at `src/components/todo/TodoItem.tsx:99` (`react-hooks/refs`)
   - the 14 empty files in `src/` (`find src -type f -size 0`): `App.css`, `index.css`, `components/TodoItem.tsx`, `components/TodoList.tsx`, `components/authForm/auth.ts`, `components/pages/AuthPage.tsx`, `components/kanban/DraggableTodo.tsx`, `components/kanban/DropLine.tsx`, `components/todo/TodoColumn.ts`, `components/todo/TodoItem/TodoMenu 2.tsx`, `components/todo/TodoItem/todoStatus.tsx`, `components/ui/fonts.tsx`, `hooks/useDropIndicator.ts`, `stores/todo-store.ts`
   - the BoardPage chunk being over 500 kB

---

## 3. Feature-by-feature plan

Each feature is tagged:
- **REAL**: uses existing data and endpoints.
- **UI-only**: a presentation preference.
- **FUTURE**: needs backend work, so we don't build it.

Each feature lists its i18n keys; their en/ru/uz values are in the table in §12.

### F1. Issue modal ↔ right-side panel — L (largest) · REAL; the layout choice is UI-only

**Files**
- New: `src/stores/taskLayout.ts`
- Edit: `TaskDetailModal.tsx`, `BoardPage.tsx`

**Work in `TaskDetailModal.tsx`**
- **`taskLayout` store:** zustand `{ layout: "modal" | "panel", setLayout }`. Saved under `localStorage` key `task:layout`, with reads and writes in try/catch. Any stored value other than `"panel"` means `"modal"`.
- **`useGuardedClose(onClose, scopeRef?)`:** move the Escape listener and `requestCloseRef` out of `Overlay` into this hook.
  - With `scopeRef` set (panel mode), ignore Escape when the key came from an `input, textarea, select, [contenteditable]` **outside** the panel. This handles gotcha 1.
- **`TaskContent({ taskId, boardId, onClose, closeRef, variant })`:** `useTodo` plus the Loading / Dead / Body switch, moved out of `Overlay`.
  - In the panel, `Loading` shows a single-column skeleton.
- **`Overlay`:** keeps its backdrop and dialog, now built from the two pieces above. **No behaviour change.**
- **New `export function TaskPanel({ boardId })`:**
  - Returns null when no task is open.
  - Below `xl`, renders a scrim `fixed inset-0 z-40 bg-black/40 xl:hidden`; clicking it goes through the guarded close.
  - The panel: `<aside ref tabIndex={-1} aria-label={t("task.details")}>`, classes `border-hairline bg-surface fixed inset-y-0 right-0 z-50 flex w-[min(28rem,100vw)] shrink-0 flex-col border-l shadow-e3 outline-none animate-in fade-in-0 slide-in-from-right-4 duration-200 xl:static xl:z-auto xl:shadow-none`.
  - Its content is keyed by `taskId`, so switching tasks remounts it.
  - Focus the aside on mount (`preventScroll`).
- **`Body` gets a `variant` prop.**
  - Modal: DOM unchanged.
  - Panel: one scroll column, `min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5`, in Jira's order:
    1. title
    2. status (`StatusControl variant="field"` in a `w-fit min-w-40` wrapper; viewers get `pointer-events-none`)
    3. description
    4. attachments
    5. subtasks / epic tasks
    6. `DevelopmentSection`
    7. the rail cards
    8. `ActivitySection`, last
- **`TaskRail`:** move the aside's contents into this local component so both variants reuse it. It takes an optional status block, then the Details card, `DevelopmentActions`, and created/updated.
- **Header actions**, passed through `Header`'s existing `actions` prop, in this order:
  1. **Copy link:** all roles.
  2. **`MoreActions`:** editors.
  3. **Open in new tab:** panel only.
  4. **Layout toggle:** `Minimize2Icon` "Open in side panel" in the modal; `Maximize2Icon` "Open as dialog" in the panel.
- **Link target:** `/tasks/${key ?? todo.id}`. `TaskRefPage` resolves keys and ids and redirects to `?task=`. Copy link writes it to the clipboard and shows a toast.
- **Comment:** reword the L56 comment in place to say the panel is opt-in.

**Work in `BoardPage.tsx`**
- At the top of `BoardView`, before its early returns, read `taskId` and `layout`.
- The `drawer` prop shows the **task panel first** (`taskId && layout === "panel"`), then members / activity / insights / settings.
- Mount `<TaskDetailModal>` only when `layout === "modal"`.

**Reuse:** the whole of `Body`, `Header`, `ConfirmBar`, `useOpenTask`, the drawer slot, and the selected-card ring that already exists.

**i18n:** `task.openInPanel`, `task.openAsDialog`, `task.openInNewTab`, `task.copyLink`, `task.linkCopied`, `task.copyLinkFailed`.

**Tests:** no component tests (the project doesn't use them). Verify with build plus the manual checklist.

**Risks**
- **Escape routing:** handled by the scope rule above.
- **The unsaved-edit guard must still run** for Escape, the scrim and the close button.
- **Task switch skips the confirmation.** Switching tasks while editing saves on blur and doesn't ask; that's acceptable.
- **Layering stays consistent:** panel at 50, preview at 60, menus at 70, toasts at 1100.

**Order:** do this before F2, so the cards are built once for both layouts.

### F2. Collapsible Details / Development cards — S · UI-only, saved per device

**Shared heading changes**
- `detailChrome.ts`: change `SECTION_TITLE` to `"text-ink text-sm font-semibold"` (title case, like Jira). Grep confirms only task-detail headings use it.
- `SectionHeader.tsx`: move the chevron *before* the title. Use one `ChevronRightIcon` with `transition-transform duration-150` that gets `rotate-90` when expanded.

**New `src/components/todo/DetailCard.tsx`** — props `{ id, title, summary?, count?, children }`
- **Header:** a full-width `aria-expanded` button with hover `bg-wash` and an inset focus ring. It holds:
  - the rotating chevron
  - the title
  - an optional `COUNT_CHIP`
  - when collapsed, the `summary` in `text-ink-3 text-mini truncate`
- **Body:** `border-t`, with `animate-in fade-in-0 duration-150`.
- **Saved state:** the collapsed flag lives at `localStorage["task:card:<id>"]`. Read it in the `useState` initializer, inside try/catch.

**Using it**
- **Details:** `<DetailCard id="details" title={t("workflow.details")} summary=…>`. The summary is the labels of the fields actually shown, joined with ", ".
- **`DevelopmentActions`:** wrap its content in `DetailCard id="development"`, with `count={developmentCount(data) || undefined}`. Delete its own header and collapse state, and keep its visibility rules.
- **Status label:** drop the visible "Status" label above `StatusControl`. The control already has the aria-label "Status: X".

**i18n:** none new. **Tests:** none (presentation only).

### F3. Attachments UX — S/M · REAL, using the existing upload endpoint

**File:** `AttachmentsSection.tsx`, plus a small polish in `AttachmentItem.tsx`.

- **Shared adder:** pull `addFiles(files)` out of `handlePicked`. It expands the section, sets the filter back to "all" and calls `startUpload` per file.
- **Drag-and-drop (only when `canAttach`):**
  - Make the section `relative` and add `onDragEnter`/`onDragOver`/`onDragLeave`/`onDrop`.
  - Each handler acts only when `dataTransfer.types.includes("Files")`. Card drags (dnd-kit uses pointer events) and text drags are left alone.
  - Keep a depth counter in a ref so the overlay doesn't flicker, and set `dropEffect = "copy"`.
  - Overlay: `pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-card border-2 border-dashed border-brand bg-brand-soft text-brand text-meta font-medium`, showing `attachments.dropHere`.
- **Empty state:**
  - Editors: a dashed box, `border-hairline rounded-card flex flex-wrap items-center justify-center gap-2 border border-dashed px-4 py-5 text-meta text-ink-3`, containing `attachments.dropOr` and a bordered "Add attachment" button that opens the existing hidden file input.
  - Viewers: keep today's empty line.
- **Polish:** give `AttachmentRow` the `group` class and put `HOVER_REVEAL` on its ⋯ trigger. The token already keeps it visible for touch, keyboard focus and an open menu.

**i18n:** `attachments.dropHere`, `attachments.dropOr`.

**FUTURE (frontend-only, not now):**
- paste-to-upload
- dropping anywhere on the task
- a real progress bar, which needs XHR because fetch reports no upload progress

### F4. Comment quick actions — S · REAL (the text is pre-filled; posting is unchanged)

**`Composer` in `CommentThread.tsx`**
- **Avatar:** the current user's avatar on the left, found through `useAuth` + `useBoardMembers` (already cached).
- **Quick-reply chips:** only while the draft is empty.
  - Five chips, from the `comments.quick.*` keys, in `flex flex-wrap gap-1.5` with `role="group"` and an aria-label.
  - Chip style: `border-hairline bg-surface text-ink-2 hover:bg-wash-strong hover:text-ink rounded-full border px-2.5 py-1 text-mini font-medium`, plus a focus ring.
  - **Click:** set the draft (or append with a space if there's text), focus the textarea and put the cursor at the end.
- **"M" shortcut:** a document keydown listener that **checks `event.code === "KeyM"`**. On the ru/uz keyboard layouts that key types "ь", so checking the letter would miss it.
  - Skip if the key was already handled, is a repeat, is mid-composition (`isComposing`), has meta/ctrl/alt held, or came from an input, textarea, select or contenteditable.
  - Otherwise mark it handled (`preventDefault`) and focus the composer.
- **Hint:** add `comments.proTip` next to the ⌘↵ hint (`hidden sm:inline`).

**Polish in `ActivitySection`:** turn the tabs into Jira's segmented control (`SEGMENTED` + `SEGMENT h-7 px-3 text-meta`, active `SEGMENT_ACTIVE`). Keep the tab roles and aria attributes.

**i18n:** `comments.quickLabel`, `comments.proTip`, `comments.quick.{looksGood,needHelp,blocked,clarify,onTrack}`.

### F5. Subtask creation UX — S · REAL

**`AddSubtaskRow`**
- **Input:** a container `border-hairline bg-surface rounded-control flex h-10 items-center gap-2 border pr-1.5 pl-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand`, holding a borderless input with placeholder `subtasks.namePlaceholder`.
- **Submit button:** a trailing `IconButton` with `CornerDownLeftIcon`, labelled `subtasks.create`. It's disabled while empty or saving, and stops mousedown from taking focus.
- **Below the input:** `ChooseExisting` (F6) on the left; a **Cancel** button on the right that discards the text. It replaces "Done".
- **Keys:** Enter still adds and stays open; Escape still marks the key handled and closes.
- **Blur:** blur still submits. **But the row's `onBlur` must ignore focus moving into a `[data-card-popover]` panel.**
  - Without that, opening the Choose-existing popover blurs the empty input. The row then closes and unmounts the popover.
- **Empty state:** editors get a clickable muted "Add subtask" line that opens the row; viewers keep "No subtasks yet."
- **Progress:** put a right-aligned `common.percentDone` label next to the bar. The progress counts **all** subtasks, even when Hide done is on.

**i18n:** `subtasks.namePlaceholder`, `subtasks.create`, `common.percentDone`.

**Optional:** a work-type picker in the row. `useAddSubtask` would take an optional `type`, used in both the request and the optimistic row.

### F6. "Choose existing" subtask — M · REAL (the database trigger enforces the hierarchy rules)

- **Rule helper:** add `canBecomeSubtaskOf(todos, candidate, parent)` to `services/todos/subtasks.ts`, with tests. A candidate qualifies only if it:
  - is not the parent itself
  - is not already the parent's child
  - is not an Epic
  - has no children of its own
  - is not the parent's own parent
- **New `src/components/todo/SubtaskControls.tsx`, with a `ChooseExisting` component:**
  - **Trigger:** a brand inline button (SearchIcon + "Choose existing") that opens a `useCardPopover({ placement: "bottom-start" })` popover.
  - **Panel:** `POPOVER_PANEL z-[70] flex max-h-80 w-80 flex-col p-0`.
  - **Search field:** autofocused, styled like `FilterPopover`'s `SearchField`.
  - **List:** at most 50 rows rendered. Each row is a `MENU_ITEM` with the work-type icon, the key (`text-ink-3 text-mini tabular-nums`) and the title.
  - **Matching:** reuse `matchOptions` over `{ value: id, label: "KEY title" }`.
- **On pick:** `useUpdateTodo().mutate({ id, board_id, parent_id: parent.id, sprint_id: null })`, then close.
  - **`sprint_id: null` is required**, because the trigger refuses a subtask that has its own sprint.
  - Errors surface through the global toast.
- **Empty list:** show `subtasks.noCandidates`.
- **Note:** the chosen card leaves the board view (subtasks aren't shown on the board), as in Jira.

**i18n:** `subtasks.chooseExisting`, `subtasks.searchExisting`, `subtasks.noCandidates`.

### F7. Subtask table + Configure columns — M · UI-only settings over the real inline-edit controls

**New `src/services/todos/subtaskTable.ts`, with tests**
- **Columns:** `["priority","assignee","status","estimate","due"]`; defaults are priority, assignee, status.
- **Sorts:** `["created","priority","status"]`.
- **Settings shape:** `{ columns, hideDone, sort }`, normalised on read and saved under `subtasks:table` (removed again when back to defaults).
- **`arrangeSubtasks(subtasks, prefs, statuses)`:**
  - Hide done through `doneStatusIds`.
  - Sort by priority with `priorityRank`, or by status using the statuses' board order.
  - Break ties by creation order, and never mutate the input.

**Store:** `src/stores/subtaskTable.ts`, following the `toolbarControls` pattern.

**Table**
- **Grid:** set an inline `gridTemplateColumns` on each row:

  | Column | Width |
  |---|---|
  | work | `minmax(12rem,1fr)` |
  | priority | `7rem` |
  | assignee | `9rem` |
  | status | `8rem` |
  | estimate | `4.5rem` |
  | due | `7rem` |

  Give the table a `minWidth` equal to the sum, inside an `overflow-x-auto` wrapper (needed in the side panel).
- **Header labels are visible:** `fields.work/priority/assignee/status/estimate/dueDate`.
- **Work cell:** work-type icon + key (`text-brand hover:underline`) + title.
- **Other cells:** reuse the List view's `variant="cell"` controls for priority, assignee, estimate and due date, and `StatusControl variant="lozenge"`. `ListCell.tsx:54–135` is the reference.

**Header buttons** (only when subtasks exist), in `SubtaskControls.tsx`
- **⋯ options menu:** a Hide done checkbox item, a separator, a `MENU_LABEL` "Sort by", and three radio items with a `CheckIcon` on the selected one.
- **Columns menu:** `Columns3Icon`, showing `active` when not on defaults.
  - Popover `w-64`, headed `list.columns`.
  - A locked "Work" row with `LockIcon`, then a checkbox row per column.
  - Footer: "Restore defaults" plus a `list.visibleOf` counter.
  - No search box: there are only 6 columns, and `FilterPopover` only adds search from 7 options.
- Then the existing **+** button, for editors.

**Not building:** Bulk edit and "View in search" (FUTURE; nothing backs them).

**i18n:** `subtasks.actions`, `subtasks.hideDone`, `subtasks.sortBy`, `subtasks.restoreDefaults`. Reuse `board.configureColumns`, `list.columns`, `list.visibleOf` and `fields.*`.

### F8. Board assignee/member filtering — M · REAL (the existing URL filters)

**New `src/components/board/AssigneeFilter.tsx`**, placed at the start of the existing **"filter" toolbar slot** in `ViewToolbar.tsx:61–66`. It moves with the Filter button, and the toolbar control list and its tests don't change.
- **Group:** `role="group" aria-label={t("filter.by",{name: FILTER_LABELS.assignee})}`, classes `hidden @2xl:flex items-center -space-x-1.5`.
- **Avatar toggles:**
  - **Unassigned** (`UNSET`), shown as `UserRoundIcon` in a `bg-wash-strong` circle.
  - **You**, as **`ME`** rather than your id, so the Filter popover's "Assigned to me" tick stays in sync.
  - **Up to 3 other members**, by id.
  - **A "+N" chip** that opens a `useFilterPopover` panel listing the rest as `FilterOptionRow`s.
- **Each toggle:** a `Tooltip` around a button with `aria-pressed`, holding a 32px `Avatar` (the default size, matching the `h-8` toolbar).
  - Styles: `ring-2 ring-canvas`; on hover `-translate-y-0.5 z-10 transition-transform duration-150`; when pressed `ring-brand z-10`.
  - The "+N" chip shows as pressed when any member hidden inside it is selected.
- **Action:** `view.toggleFilter("assignee", value)`.

**Clear filters:** in the same slot, `{view.filterCount > 0 && <ToolbarButton label={t("view.clearFilters")} icon={null} onClick={view.clearFilters}/>}`. It clears filters only, not search, matching its label.

**i18n:** `filter.moreAssignees`; everything else reuses existing keys.

**Note:** the avatars hide on narrow toolbars, for example while the panel is open on a 1280px screen. The Filter popover still works there.

### F9. Board View Settings — M · UI-only, saved per device

**Setup**
- **`usePanel.ts`:** `PANELS = ["members","activity","insights","settings"]`.
- **New `src/services/views/boardViewPrefs.ts`, with tests:**
  - shape `{ columnSize: "fixed"|"flexible", scroll: "columns"|"board" }`
  - normalised on read, saved under `board:view-prefs`
  - same pattern as `toolbar.ts`
- **New store:** `src/stores/boardViewPrefs.ts`.

**Wiring**
- **`BoardActions.tsx`:** add an `IconButton` with `SlidersHorizontalIcon`, labelled `viewSettings.title`.
  - It only shows when the `showViewSettings` prop is set (ViewToolbar passes `view.mode === "board"`).
  - It toggles `?panel=settings`.
  - Its active look must not be cancelled by a later `bg-transparent` (gotcha 3).
- **`BoardPage.tsx`:** `panel === "settings"` renders `<Drawer title=…><ViewSettings/></Drawer>`.

**New `src/components/board/ViewSettings.tsx`**
- **Column size:** two option cards with `aria-pressed` and a small three-bar drawing. Selected: `border-brand bg-brand-soft text-brand`.
- **Scrolling:** a two-way segmented control, `h-9`.
- **Device note** at the bottom.

**Applying the settings** — board view only; swimlanes are untouched

| Element | Fixed + within columns (today) | Flexible | Whole board |
|---|---|---|---|
| Scroll box (`KanbanBoard`) | `overflow-x-auto` | unchanged | `overflow-auto` |
| Row (`KanbanBoard`) | `flex h-full min-w-max` | `min-w-full` instead of `min-w-max` | `min-h-full` instead of `h-full` |
| `SortableColumn` wrapper (the flex item) | — | `min-w-[264px] flex-1 basis-0` | — |
| `KanbanColumn` root | `COLUMN_WIDTH`, `h-fit max-h-full` | `w-full` instead of `COLUMN_WIDTH` | `h-fit`, no `max-h-full` |

- **Why flexible drops `min-w-max`:** with growable columns, `min-w-max` would size the row by the longest unwrapped card title.
- **Whole-board exception:** the `choices` `h-full` case in `KanbanColumn` stays.
- `KanbanBoard` reads the settings with a single selector and passes `flexible` and `wholeBoard` down through `SortableColumn` to `KanbanColumn`.

**Optional extras**
- **"Hide done after N days":**
  - a pure `hideStaleDone` helper with a test, keyed on `completed_at`
  - applied in `KanbanBoard` before `useTodosByColumns`
  - `exactOrder` becomes false when anything was hidden
- **"Show fields":** card field visibility, read in `TodoContainer` through a selector that returns a stable value.

**FUTURE:** settings shared across the whole board (a `boards` jsonb column, like `view_tabs`).

**i18n:** `viewSettings.*`.

### F10. Sprint Insights — M (burndown is L and optional) · REAL

**New `src/services/sprints/insights.ts`, with tests:** `sprintInsights(todos, sprintId, statuses, today)` returns:
- counts and percentages for done, in progress (which includes `in_review`) and not started
- **overdue items:** not done and `due_date < today`, sorted by due date
- **epics:** sprint items whose parent is an Epic, each with `epicTaskProgress`
- **points:** from `sprintPoints`

Also move `daysLeft` here from `SprintDetails`, exported and tested.

**Toolbar button:** `SprintDetails.tsx` becomes the toggle for `?panel=insights` (`ChartLineIcon`, active while open). The popover goes; its markup moves to the panel.

**New `src/components/board/SprintInsights.tsx`**, inside a `Drawer`:
- **Intro:** a short intro, plus the sprint name, dates and days left.
- **"Needs attention" card:** overdue rows showing type icon, key, title and due date. Clicking a row calls `openTask`. Shows an empty message when nothing is overdue.
- **Sprint progress:** a stacked bar (green done / blue in progress / `wash-strong` not started), the percent-done label, and three stats.
- **Points:** total, completed, unestimated.
- **Epic progress:** each epic's key and title (as a link), % done and a bar.
- **No active sprint:** an `EmptyState` using `sprint.noneActive`.

**In panel layout,** clicking an item opens the task panel over Insights. Closing the task returns to Insights.

**Optional burndown**
- remaining points per day = current scope minus points completed by that day (from `completed_at`)
- a straight guideline from start to end
- hand-drawn SVG like `TrendsChart`
- **it must say "based on current scope"**, because scope changes aren't recorded

**FUTURE:** stuck/blocked/flagged items, and a scope-change history.

**i18n:** `insights.*`.

### F11. Board navigation / horizontal scroll control — M · UI-only

**New `src/utils/minimap.ts`, with tests**
- `minimapViewport(scrollLeft, clientWidth, scrollWidth)` returns `{ left, width }` as fractions, or `null` when nothing overflows.
- `scrollLeftAt(ratio, clientWidth, scrollWidth)` returns a centred, clamped scroll position.

**New `src/components/kanban/BoardMinimap.tsx`** — props `{ scrollerRef, columns }`
- **State:** keeps its own state only.
- **Tracking:** listens to the scroll box's `scroll` event (passive) and observes it and its first child with `ResizeObserver`, updating once per animation frame.
- **Rendering:**
  - renders nothing when there's no overflow
  - `aria-hidden`
  - container `absolute right-4 bottom-4 z-10 h-10 w-28 rounded-lg border border-hairline bg-elevated p-1 shadow-e2 opacity-90 hover:opacity-100`
  - one bar per column: `flex-1 rounded-sm bg-wash-strong`
  - a viewport box `absolute inset-y-0 rounded-md border-2 border-brand`, positioned by percentage
- **Interaction:** pressing on the track smooth-scrolls to centre that spot. Dragging the box with pointer capture scrolls the board along.

**`KanbanBoard`:** add a ref to the scroll box and `relative` to the root. Render the minimap only in the non-swimlane branch.

### F12. General spacing, popovers, animations, micro-interactions — S · UI-only

- **Drawer:** add an enter animation to the `Drawer` aside (`animate-in fade-in-0 slide-in-from-right-4 duration-200`).
- **Toasts:** the toast root gets `animate-in fade-in-0 slide-in-from-bottom-2 duration-200`.
- **Complete sprint:** make it Jira's filled dark button (`bg-ink text-canvas hover:bg-ink/90 border-transparent`).
- **Timestamps:** give the rail's created/updated text a `title` with the exact date.
- **Unchanged:** existing popover transitions, card hover lift and the "+" between cards are already Jira-like.

---

## 4. Shared components to create / reuse

| New | Purpose | Used by |
|---|---|---|
| `todo/DetailCard.tsx` | Collapsible bordered card with summary, saved per device | Details, Development |
| `TaskPanel`, `TaskContent`, `useGuardedClose`, `TaskRail` (inside `TaskDetailModal.tsx`) | One task body, two shells | Modal, panel |
| `todo/SubtaskControls.tsx` | `ChooseExisting`, columns menu, options menu | Subtasks |
| `board/AssigneeFilter.tsx` | Avatar toggles + "+N" overflow | Toolbar filter slot |
| `board/ViewSettings.tsx`, `board/SprintInsights.tsx` | Drawer bodies | `BoardPage` |
| `kanban/BoardMinimap.tsx` | Horizontal navigator | `KanbanBoard` |
| `stores/taskLayout.ts`, `stores/boardViewPrefs.ts`, `stores/subtaskTable.ts` | Settings saved on this device | as above |
| `services/views/boardViewPrefs.ts`, `services/todos/subtaskTable.ts`, `services/sprints/insights.ts`, `utils/minimap.ts` | Pure logic + tests | as above |

**Reuse, and don't rebuild:**
- floating UI: `useCardPopover`, `useFilterPopover`, `FloatingPortal`
- chrome: `POPOVER_PANEL`, `MENU_ITEM`, `MENU_LABEL`, `MENU_SEPARATOR`, `TEXT_FIELD`, `SEGMENTED/SEGMENT*`, `INLINE_ACTION*`, `TABLE*`, `COUNT_CHIP`, `HOVER_REVEAL`
- controls: `IconButton`, `ToolbarButton`, `Drawer` (board drawers only), `Avatar`, `Tooltip`, `EmptyState`, `Skeleton`, `FilterOptionRow`, `matchOptions`
- `variant="cell"` field controls, `StatusControl variant="lozenge|field"`
- hooks: `useBoardView`, `usePanel`, `useOpenTask`, `useBoardMembers`, `useTodos`, `useStatuses`, `useSprints`, `useUpdateTodo`, `useAddSubtask`, `useUploadAttachment`
- helpers: `sprintPoints`, `epicTaskProgress`, `doneStatusIds`, `priorityRank`, `workTypeOf`, `taskKey`
- `toast`

---

## 5. Exact implementation order

- **Phase 0 — groundwork; nothing visible changes except headings** (S)
  1. Add all new i18n keys to en/ru/uz from the §12 table.
  2. `SECTION_TITLE` restyle; `SectionHeader` chevron on the left, rotating.
  3. `DetailCard.tsx`.
  4. `stores/taskLayout.ts`.
  5. `usePanel` gets `insights` and `settings`.
  6. `boardViewPrefs` service + test + store.
  7. `subtaskTable` service + test + store; `canBecomeSubtaskOf` + test.
  8. `minimap.ts` + test; `insights.ts` + test.
- **Phase 1 — task view:** F1 side panel (L), then F2 cards (S), then F4 comments (S).
- **Phase 2 — attachments and subtasks:** F3 (S/M), then F5 (S), then F6 (M), then F7 (M).
- **Phase 3 — board:** F8 avatars and Clear filters (M), then F9 View settings (M).
- **Phase 4:** F10 Sprint insights, without the burndown (M); then F11 minimap (M).
- **Phase 5 — polish and accessibility:** F12, plus a keyboard and focus pass, and checks for reduced motion, dark mode, ru and uz.
- **Phase 6 — verification:** see §10.

**If the budget runs out:** stop after Phase 3 and report. The optional items (burndown, hide-done-after, show-fields, subtask type picker) come last, only if there's budget left.

---

## 6. Dependency graph

```
P0 i18n keys ───────────────────────────────────────────────▶ every feature
P0 SECTION_TITLE + SectionHeader ──┐
P0 DetailCard ─────────────────────┴─▶ F2 cards (Details, Development)
P0 taskLayout store ──▶ F1 panel ──▶ (F2 cards render in both shells; build F1 first)
P0 usePanel(+insights,+settings) ──▶ F9 View settings drawer, F10 Insights drawer
P0 boardViewPrefs ──▶ F9 ──▶ KanbanBoard/SortableColumn/KanbanColumn classes
P0 subtaskTable + canBecomeSubtaskOf ──▶ F5 create row ──▶ F6 Choose existing ──▶ F7 table/menus
P0 minimap.ts ──▶ F11 (check after F9: flexible/whole-board change the scroll sizes)
P0 insights.ts ──▶ F10
F3, F4, F8, F12: independent
```

---

## 7. Risk / regression analysis

| Risk | Where | Mitigation |
|---|---|---|
| Board text inputs close the panel on Escape | F1 | Panel Escape ignores editable elements outside the panel |
| Unsaved-edit guard skipped | F1 | All close paths go through `closeRef`; never wrap the panel in `Drawer` (M17 bug) |
| Task drawer and board drawer at once | F1/F9/F10 | `openPanel` already removes `task`; the task panel wins the slot |
| Popover blur closes the subtask row | F5/F6 | Row `onBlur` ignores `[data-card-popover]` targets |
| Re-parent refused | F6 | Client filter mirrors the trigger; send `sprint_id: null`; errors show in the global toast |
| Flexible columns grow to the longest title | F9 | Drop `min-w-max` in flexible mode; `basis-0 flex-1 min-w-[264px]` on the wrapper |
| Whole-board mode breaks drag or status zones | F9 | `choices` keeps `h-full`; verify drag across columns while scrolled |
| Filter popover and avatars disagree | F8 | Current user = `ME`, not the id |
| Locale test failures | all | Add keys to all 3 files at once; no stray `"namespace.key"` strings; no plurals added |
| `active` look cancelled | F9/F10 buttons | Don't add `bg-transparent` when active |
| File drop hijacks card drags | F3 | Act only when `dataTransfer.types` has `"Files"` |
| Shortcut fires inside inputs or with IME | F4 | Target/modifier/`isComposing` guards; use `code === "KeyM"` |
| Toolbar too wide | F8 | `hidden @2xl:flex`; Clear filters only appears while filtering |

---

## 8. Performance considerations

- **No new network requests.** Everything derives from cached queries (`todos`, `workflow`, `sprints`, `members`, per-task queries already used by the modal).
- **Minimap scroll state stays inside the minimap.** Never lift it into `KanbanBoard`, or every scroll frame re-renders all columns. Use passive listeners and update once per animation frame.
- **Don't add URL reads to cards.** `TodoContainer` already re-renders on any URL change. The side panel doesn't make that worse; just don't add `useSearchParams` / `useOpenTask` anywhere per card.
- **Read settings once per column, not per card.** If the optional "Show fields" is built, use a selector that returns a stable array reference so the card memo holds.
- **Choose existing:** filter with `useMemo` from cached todos, and render at most 50 rows.
- **Insights:** `useMemo` over cached data, and only while the drawer is open.
- **Avatar filter:** toggling a filter re-runs `useVisibleTodos`, exactly as the Filter popover already does.
- **Switching tasks in the panel:** remounts the body, and the per-task queries are cached by key.

---

## 9. Visual fidelity checklist (per screenshot)

Wherever Jira uses blue, use our `brand` / `brand-soft`. Sizes are approximate, in CSS px.

| # | File | What to reproduce |
|---|---|---|
| 1 | 20.51.26 | **Modal.** Header (~56px): breadcrumb (parent / type icon + key) on the left; on the right, 32px icon buttons: ⋯, minimize (↘↖), close. Columns ≈ 62/38. **Left column:** Description; Attachments (chevron left of the title; dashed drop zone ~76px tall with a centred "Add attachment"); Subtasks ("Add subtask" muted text); Activity (segmented tabs, sort icon); composer (32px avatar, bordered box, quick-reply chips, "Pro tip: press M"). **Right column:** status button, then collapsible cards (Details collapsed with a grey list of field names), created/updated. Headings: title case, semibold; about 32px between sections. |
| 2 | 20.51.38 | Same as #3, inside an image viewer. Nothing extra. |
| 3 | 20.51.41 | **Side panel.** Board stays visible and narrower; panel ~400px, full height, left border. Top: open-in-new-tab, expand (↗↙), close. Single column: key + actions, large title, status row, Description, Attachments, Subtasks, then the cards **at the bottom**. Selected card: accent border. Minimap at the board's bottom-right. |
| 4 | 20.51.48 | **Subtask create.** Heading with chevron on the left and + on the right; 40px input with a 2px accent focus ring, "Name this subtask", ↵ button inside on the right; below: accent "🔍 Choose existing" on the left, "Cancel" on the right. (The inline "Subtask ▾" chip is optional, F5.) |
| 5 | 20.51.54 | **Subtask table.** Heading actions ⋯, columns icon (tooltip "Configure columns"), +; full-width progress bar with a "% done" label; bordered, rounded table; grey header row Work / Priority / Assignee / Status; rows ~44px: type icon + underlined accent key + title, priority icon + label, avatar + name, status pill. |
| 6 | 20.52.00 | **Configure columns popover.** Checked items first, then a separator, then unchecked; hovered row gets grey background (Jira also shows a left accent bar); footer "Restore defaults" + "N of M"; trigger in the selected state. (We skip the search box: only 6 options.) |
| 7 | 20.52.07 | **⋯ menu.** "Hide done" checkbox, a Sort section, separator; trigger selected (accent border + soft background). Bulk edit and View in search are **skipped** (FUTURE). |
| 8 | 20.52.13 | **Toolbar.** Search (~160px); overlapping 32px avatars, Unassigned first, selected avatar gets a 2px ring; "Filter" with a count badge in the active state; **"Clear filters" appears**; dark filled "Complete sprint"; 32px bordered icon buttons, 4px apart. |
| 9 | 20.52.23 | **View settings.** Sliders button selected; right drawer with title and close; **Column size**: hint + 2 option cards (selected = accent border + soft background, 3-bar drawing); **Scrolling**: hint + two-way segmented control. Show fields and Hide-done are optional. |
| 10 | 20.52.28 | **Sprint insights.** Chart button selected; drawer: intro + "Sprint: name"; attention card with empty copy; Sprint progress: bar + "% done" + three stats (in progress number in accent colour). |
| 11 | 20.52.34 | **Insights, scrolled.** Epic progress (key + title link, % done, bar); the burndown chart is optional. Card hover shows ✎ and ⋯ (**already built**). |
| 12 | 20.52.42 | **Minimap.** ~104×42 rounded white box, soft shadow, one bar per column with 2px gaps, viewport = 2px accent rounded rectangle. |
| 13 | 20.52.49 | Same as #10. |

**States and motion**

| Element | Behaviour |
|---|---|
| Popovers | Fade + 4px slide (existing) |
| Panel and drawers | Slide in from the right, 200 ms |
| Chevrons | Rotate, 150 ms |
| Avatars | Lift on hover |
| Drop overlay | Fades in |
| Hover | `bg-wash-strong` |
| Selected | Accent ring/border + `brand-soft` |
| Loading | The existing per-section skeletons |
| Empty states | Muted text that acts as a button for editors |

**Skipped on purpose:**
- watchers (👁 1), share, ⚡ Automation (button and card), Linked work items
- "Document known errors / Try", "Configure" fields, toast actions
- "Learn more" / "Give feedback"

---

## 10. Verification checklist

**After every phase (automated)**
- `npm run build` passes (it's the only type check).
- `npm run lint` shows nothing new; only the existing `src/components/todo/TodoItem.tsx:99` error may remain.
- `npm test` passes, including `locales.test.ts` and the new tests:
  - `subtasks.test.ts` (extended)
  - `subtaskTable.test.ts`
  - `boardViewPrefs.test.ts`
  - `insights.test.ts`
  - `minimap.test.ts`
- `git status` shows only the planned files. No commits.

**Manual, in a browser** (browser checks couldn't be run during planning: the connected Chrome is a remote Windows machine)
- **Side panel**
  - Opening a card shows the panel and rings the card; clicking another card switches the panel.
  - Back closes it; the layout toggle works both ways and survives a reload.
  - Escape inside the panel closes it; Escape in the board's create form or a column rename doesn't.
  - Escape mid-edit shows the unsaved-changes bar.
  - Below 1280px the panel overlays the board with a scrim.
  - The new-tab link `/tasks/KEY` resolves; Copy link shows a toast.
- **Cards:** collapse and expand; the summary shows when collapsed; the state is remembered across tasks and after reload.
- **Attachments**
  - Dragging a file over shows the overlay; dropping it uploads with a pending row.
  - Viewers can't drop; the empty-state button opens the file picker.
- **Comments**
  - Chips insert text and focus the box.
  - M focuses the composer, also on a Russian keyboard layout; M typed inside an input just types.
- **Subtasks**
  - **Create row:** Enter adds and stays open; ↵ submits; Cancel discards; Escape closes the row but not the task.
  - **Choose existing:** lists only valid cards. Picking a card from the active sprint works (its sprint is cleared) and the card leaves the board.
  - **Table:** column choices and Restore defaults are remembered; Hide done and sort work; progress still counts all subtasks.
- **Toolbar**
  - Avatars toggle Unassigned, me and members, and the Filter popover shows the same ticks.
  - "+N" works; Clear filters appears and clears.
- **View settings**
  - Flexible fills the width, and long titles don't widen columns.
  - Whole board scrolls vertically, and dragging cards while scrolled still auto-scrolls.
  - Swimlanes are unchanged.
- **Insights:** counts match the old popover; the overdue list and epics are correct; the "no active sprint" state shows when it should.
- **Minimap:** appears only with horizontal overflow, tracks scrolling, and click/drag scrolls the board.
- **Across the board**
  - Viewer, editor and admin roles.
  - Light and dark themes.
  - en, ru and uz.
  - Reduced motion: animations are off.

---

## 11. Explicit "DO NOT CHANGE" list

- **Backend:** the backend, Prisma schema, migrations and `.env` files.
- **Drag and drop:** `useKanbanDnd`, `useBoardDragEnd`, `useTodoDrop`, `dropIndex`, `utils/rank.ts`, `DropZone`, `ColumnDropZone`, `StatusDropZones`, `ReorderContext`.
- **Board rules:**
  - `isOnBoard`, `useVisibleTodos`' pipeline order and `topLevelTodos`
  - `queryKeys` (no new keys)
  - the cache helpers in `services/*/cache.ts`
- **URL behaviour:** `useOpenTask` and `usePanel` URL behaviour, except adding the two `PANELS` values. Don't make `openTask` remove `panel`.
- **`Drawer` Escape behaviour:** leave it as it is, and don't use `Drawer` for the task panel.
- **The task's unsaved-edit guard and the inline confirm bars.** Don't add dialogs on top of the task.
- **Attachments:** upload/download/delete order, the `previewKind` gate, `AttachmentPreview`.
- **Hierarchy:** the hierarchy trigger is the authority. Only filter candidates client-side; don't re-implement the rules elsewhere.
- **User data stays untranslated:** never translate column titles or status names.
- **Existing features to leave alone:**
  - the main-column `DevelopmentSection` list and the GitLab module
  - the Work log placeholder
  - `MemberStack`
  - the toolbar control list and its tests (F8 avoids it on purpose)
- **Card memo:** `TodoCard`/`TodoItem` memo boundaries; no new per-card hooks.
- **Styling:** the colour palette and design tokens; no Jira blue. No new tokens (a new one would also have to be registered in `src/utils/cn.ts`).
- **Pre-existing problems:** the lint error at `TodoItem.tsx:99`, the empty files, the chunk-size warning. No unrelated clean-up.
- **No new dependencies** (no chart, file-drop or virtualisation libraries).
- **No commits or pushes.**

---

## 12. Final handoff instructions for the coding model

**Role.** You are implementing a Jira-style UX pass on an existing React 19 + TypeScript + TanStack Query + Tailwind v4 Kanban app (repo root `TODO_app`). You have the same screenshots (`jira_design_samples/`) and this blueprint (§1–§11); treat it as the spec. Work frontend-only.

**Hard rules**
1. **No git.** Do NOT commit, push or stage. The tree may already hold uncommitted work (the GitLab Development card, 11 files) — build on it, don't revert it.
2. **No backend, migration, query-key, or dependency changes.** No unrelated refactors or clean-up. Leave the pre-existing `TodoItem.tsx:99` lint error and the empty files alone.
3. **Read before you edit.** Read each file before editing it. Copy the patterns this blueprint names (`useCardPopover`, `ExistingTaskPicker`, `ListColumns`' `ColumnRow`, the `toolbar.ts` guarded-localStorage idiom, the `ListCell` `variant="cell"` controls).
4. **Minimal comments.** Only for a truly non-obvious reason. No section banners, no JSDoc.
5. **i18n, all three locales.** Add every new string to `src/components/i18n/locales/{en,ru,uz}.json`, using the table below. Don't write any `"namespace.key"`-shaped string literal (comments included) that isn't a real key. Add no plural keys.
6. **Respect permissions** (`usePermissions`):
   - create, edit and re-parent: `canEditTodos`
   - upload and drop: `canAttach`
   - composer: `canComment`
   - layout/view preferences: everyone
7. **Colours.** Selected/active colour is our `brand` / `brand-soft`, never Jira blue. Use the existing chrome constants (`detailChrome.ts`, `controlChrome.ts`, `headerControl.ts`).
8. **Per-card rendering.** Never add a URL read or a new hook per board card. Minimap scroll state stays inside the minimap.
9. **After each phase:**
   - run `npm run build`, `npm run lint` and `npm test` (from the repo root)
   - run `npx prettier --write` on the files you touched (only those)
   - fix anything you caused before moving on

**Phase 0 — groundwork**
- **0.1** Add all keys from the table below.
- **0.2 Headings:**
  - `detailChrome.ts`: set `SECTION_TITLE = "text-ink text-sm font-semibold"`.
  - `SectionHeader.tsx`: move the chevron before the title, as one `ChevronRightIcon` with `transition-transform duration-150` and `rotate-90` when expanded.
- **0.3 `src/components/todo/DetailCard.tsx`** (props `{ id, title, summary?, count?, children }`):
  - collapsed flag saved in `localStorage["task:card:"+id]`, guarded
  - header button `aria-expanded`, holding the rotating chevron, title, optional `COUNT_CHIP`, and `summary` (truncated, `text-ink-3 text-mini`) only when collapsed
  - body `border-t animate-in fade-in-0 duration-150`
- **0.4 `src/stores/taskLayout.ts`:** zustand `{ layout: "modal"|"panel", setLayout }`, key `task:layout`, guarded; default `"modal"`.
- **0.5 `src/hooks/usePanel.ts`:** `PANELS = ["members","activity","insights","settings"]`.
- **0.6 `src/services/views/boardViewPrefs.ts` + `.test.ts` + `src/stores/boardViewPrefs.ts`:**
  - shape `{ columnSize: "fixed"|"flexible", scroll: "columns"|"board" }`
  - key `board:view-prefs`
  - normalise junk; remove the key when back to defaults
  - test like `toolbar.test.ts`
- **0.7 Subtask settings and rule helper:**
  - **`src/services/todos/subtaskTable.ts` + `.test.ts` + `src/stores/subtaskTable.ts`:**
    - columns `priority|assignee|status|estimate|due`, defaults `priority,assignee,status`
    - sort `created|priority|status`, plus `hideDone`
    - key `subtasks:table`
    - `arrangeSubtasks(subtasks, prefs, statuses)`: hide done via `doneStatusIds`; priority via `priorityRank`; status via board order; ties by creation; no mutation
  - **`canBecomeSubtaskOf(todos, candidate, parent)`** in `src/services/todos/subtasks.ts`, with tests: not the parent, not its child, not an Epic, has no children, not the parent's parent.
- **0.8 More pure helpers with tests:**
  - `src/utils/minimap.ts`: `minimapViewport(scrollLeft, clientWidth, scrollWidth) → {left,width}|null` and `scrollLeftAt(ratio, clientWidth, scrollWidth)`, clamped.
  - `src/services/sprints/insights.ts`: `sprintInsights(todos, sprintId, statuses, today)` returning counts and percentages for done / in progress (including `in_review`) / not started, the overdue list sorted by due date, epics with `epicTaskProgress`, and points via `sprintPoints`. Move `daysLeft` here from `SprintDetails.tsx`.

**Phase 1 — task view**

**1.1 Side panel (`src/components/todo/TaskDetailModal.tsx`, `src/pages/board/BoardPage.tsx`)**
- Move Escape and `requestCloseRef` into `useGuardedClose(onClose, scopeRef?)`. With a scope, ignore Escape whose target is an `input,textarea,select,[contenteditable]` outside the panel.
- Move `useTodo` and the Loading/Dead/Body switch into `TaskContent({taskId, boardId, onClose, closeRef, variant})`. `Overlay` keeps its exact markup and behaviour.
- Add `export function TaskPanel({ boardId })`:
  - null without `?task`
  - below xl, a scrim `fixed inset-0 z-40 bg-black/40 xl:hidden` that calls the guarded close
  - `aside` with `tabIndex={-1}` and `aria-label={t("task.details")}`, classes `border-hairline bg-surface fixed inset-y-0 right-0 z-50 flex w-[min(28rem,100vw)] shrink-0 flex-col border-l shadow-e3 outline-none animate-in fade-in-0 slide-in-from-right-4 duration-200 xl:static xl:z-auto xl:shadow-none`
  - content keyed by `taskId`; focus the aside on mount with `preventScroll`
  - **Never use `Drawer` here.**
- `Body` gets `variant`:
  - Modal: unchanged.
  - Panel: one column, `min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5`, ordered title → status (`StatusControl variant="field"` in `w-fit min-w-40`, `pointer-events-none` for viewers) → description → attachments → subtasks/epic tasks → `DevelopmentSection` → rail → `ActivitySection`.
  - Move the aside contents into `TaskRail` so both variants share it.
  - Panel `Loading` is single-column.
- Header actions, in order: Copy link (all roles; `/tasks/${key ?? todo.id}` with `window.location.origin`; toast on success or failure), `MoreActions` (editors), Open in new tab (panel only; `<a target="_blank" rel="noreferrer">` styled `ICON_BUTTON.sm`), and the layout toggle (modal `Minimize2Icon` "Open in side panel" / panel `Maximize2Icon` "Open as dialog").
- Reword the L56 comment in place.
- `BoardPage`:
  - read `taskId` and `layout` before the early returns
  - `drawer` checks the task panel first, then members/activity/insights/settings
  - mount `TaskDetailModal` only when `layout === "modal"`

**1.2 Cards**
- The Details section becomes `<DetailCard id="details" title={t("workflow.details")} summary={labels of rendered fields joined ", "}>`.
- `DevelopmentActions` renders inside `<DetailCard id="development" title={t("development.title")} count={developmentCount(data) || undefined}>`; delete its old header and state.
- Remove the visible "Status" label.

**1.3 Composer (`src/components/comments/CommentThread.tsx`)**
- avatar of the current user on the left
- 5 quick-reply chips (`comments.quick.*`) while the draft is empty; click inserts the text, focuses the box and moves the cursor to the end
- document keydown with `event.code === "KeyM"`: skip when already handled, repeat, `isComposing`, meta/ctrl/alt held, or target is editable; otherwise `preventDefault` and focus
- `comments.proTip` hint (`hidden sm:inline`)
- `ActivitySection` tabs become `SEGMENTED` + `SEGMENT h-7 px-3 text-meta`

**Phase 2 — attachments and subtasks**
- **2.1 `AttachmentsSection.tsx`:**
  - pull out `addFiles`
  - when `canAttach`: section `relative` + drag handlers active only for `dataTransfer.types.includes("Files")`, a depth-counter ref, `dropEffect="copy"`, and an overlay (`attachments.dropHere`)
  - editor empty state is a dashed box: `attachments.dropOr` + a bordered `attachments.add` button
  - `AttachmentRow`: `group` + `HOVER_REVEAL` on its ⋯ trigger
- **2.2 `SubtasksSection.tsx` create row:**
  - a `h-10` focus-ring container with a borderless input (`subtasks.namePlaceholder`) and a `CornerDownLeftIcon` `IconButton` (`subtasks.create`)
  - below it, `ChooseExisting` on the left and Cancel (discards) on the right
  - keep Enter/Escape/blur behaviour, **but the row's `onBlur` must ignore focus moving into `[data-card-popover]`**
  - editor empty state is a clickable "Add subtask" line
  - progress bar gets a `common.percentDone` label (all subtasks)
- **2.3 `src/components/todo/SubtaskControls.tsx` `ChooseExisting`:**
  - popover (`z-[70] w-80 max-h-80`) with an autofocused search field and up to 50 candidates from `canBecomeSubtaskOf`, matched with `matchOptions` on "KEY title"
  - pick → `useUpdateTodo().mutate({ id, board_id, parent_id: parent.id, sprint_id: null })`
  - empty list shows `subtasks.noCandidates`
- **2.4 Table:**
  - inline `gridTemplateColumns` (work `minmax(12rem,1fr)`, priority 7rem, assignee 9rem, status 8rem, estimate 4.5rem, due 7rem), table `minWidth`, wrapper `overflow-x-auto`
  - visible header labels
  - work cell = type icon + `text-brand hover:underline` key + title
  - cells use `variant="cell"` controls and `StatusControl variant="lozenge"`
  - header buttons (when rows exist): options menu (Hide done; Sort created/priority/status), columns menu (`board.configureColumns`, `list.columns`, locked Work row, Restore defaults, `list.visibleOf`), then the existing + (editors)

**Phase 3 — board**
- **3.1 `src/components/board/AssigneeFilter.tsx`**, placed at the start of the `"filter"` Slot in `ViewToolbar.tsx`:
  - toggles for `UNSET`, **`ME`** (the current user), 3 members by id, and "+N" (`useFilterPopover` + `FilterOptionRow`)
  - 32px `Avatar`, `aria-pressed`, `Tooltip`, `ring-2 ring-canvas`, hover `-translate-y-0.5`, pressed `ring-brand`
  - group `hidden @2xl:flex`
  - in the same Slot: `{view.filterCount > 0 && <ToolbarButton label={t("view.clearFilters")} icon={null} onClick={view.clearFilters}/>}`
- **3.2 View settings:**
  - `BoardActions` gets a `showViewSettings` prop (ViewToolbar passes `view.mode === "board"`) and a `SlidersHorizontalIcon` button toggling `?panel=settings` (keep the active background)
  - `BoardPage` renders `<Drawer title={t("viewSettings.title")}><ViewSettings/></Drawer>`
  - `src/components/board/ViewSettings.tsx`: Column size option cards and a Scrolling segmented control, plus the device note
  - apply in `KanbanBoard`/`SortableColumn`/`KanbanColumn` only (not swimlanes):
    - whole board: scroll box `overflow-auto`, row `min-h-full`, column root `h-fit` (keep `choices` → `h-full`)
    - flexible: row `min-w-full` (no `min-w-max`), SortableColumn wrapper `min-w-[264px] flex-1 basis-0`, column root `w-full`

**Phase 4**
- **4.1** `SprintDetails.tsx` becomes a `ChartLineIcon` toggle for `?panel=insights`. New `src/components/board/SprintInsights.tsx` inside a `Drawer`, showing:
  - intro, sprint name, dates and days left
  - Needs attention (overdue rows → `openTask`)
  - progress (stacked bar + three stats)
  - points
  - epic progress
  - an `EmptyState` when there's no active sprint
- **4.2** `src/components/kanban/BoardMinimap.tsx` (own state; passive scroll + `ResizeObserver` + rAF; `aria-hidden`; click and drag to scroll), rendered in `KanbanBoard`'s non-swimlane branch with a ref on the scroll box and `relative` on the root.

**Phase 5 — polish**
- `Drawer` aside and `Toast` root get `animate-in` enter classes.
- Complete sprint: `bg-ink text-canvas hover:bg-ink/90 border-transparent`.
- Rail timestamps get an exact-date `title`.
- Keyboard pass: every new control is reachable and labelled.

**Optional, only with budget left:** burndown (labelled "based on current scope"), hide done after N days, card "Show fields", a work-type picker in the subtask row.

**Finish**
- Report the files changed, what's REAL vs UI-only vs skipped, and the test/build/lint results.
- Give the user the manual checklist from §10.
- Don't commit.

**Strings to add** (en / ru / uz)

| key | en | ru | uz |
|---|---|---|---|
| task.openInPanel | Open in side panel | Открыть в боковой панели | Yon panelda ochish |
| task.openAsDialog | Open as dialog | Открыть в окне | Oynada ochish |
| task.openInNewTab | Open in new tab | Открыть в новой вкладке | Yangi varaqda ochish |
| task.copyLink | Copy link | Копировать ссылку | Havolani nusxalash |
| task.linkCopied | Link copied | Ссылка скопирована | Havola nusxalandi |
| task.copyLinkFailed | Could not copy the link. | Не удалось скопировать ссылку. | Havolani nusxalab bo'lmadi. |
| common.percentDone | {{percent}}% done | Выполнено: {{percent}}% | {{percent}}% bajarildi |
| attachments.dropHere | Drop files to attach | Отпустите файлы, чтобы прикрепить | Biriktirish uchun fayllarni qo'yib yuboring |
| attachments.dropOr | Drop files here, or | Перетащите файлы сюда или | Fayllarni shu yerga tashlang yoki |
| subtasks.namePlaceholder | Name this subtask | Назовите подзадачу | Kichik vazifaga nom bering |
| subtasks.create | Create subtask | Создать подзадачу | Kichik vazifa yaratish |
| subtasks.chooseExisting | Choose existing | Выбрать существующую | Mavjudini tanlash |
| subtasks.searchExisting | Search by key or title | Поиск по ключу или названию | Kalit yoki sarlavha bo'yicha qidiring |
| subtasks.noCandidates | No work item can become a subtask here. | Здесь нет задач, которые можно сделать подзадачей. | Bu yerda kichik vazifaga aylantirsa bo'ladigan ish elementi yo'q. |
| subtasks.actions | Subtask options | Параметры подзадач | Kichik vazifa sozlamalari |
| subtasks.hideDone | Hide done | Скрыть выполненные | Bajarilganlarni yashirish |
| subtasks.sortBy | Sort by | Сортировать по | Saralash |
| subtasks.restoreDefaults | Restore defaults | Вернуть по умолчанию | Standartga qaytarish |
| comments.quickLabel | Quick replies | Быстрые ответы | Tezkor javoblar |
| comments.proTip | Pro tip: press M to comment | Совет: нажмите M, чтобы оставить комментарий | Maslahat: izoh qoldirish uchun M tugmasini bosing |
| comments.quick.looksGood | 🎉 Looks good! | 🎉 Выглядит отлично! | 🎉 Zo'r chiqibdi! |
| comments.quick.needHelp | 👋 Need help? | 👋 Нужна помощь? | 👋 Yordam kerakmi? |
| comments.quick.blocked | ⛔ This is blocked… | ⛔ Это заблокировано… | ⛔ Bu bloklangan… |
| comments.quick.clarify | 🔍 Can you clarify…? | 🔍 Можете уточнить…? | 🔍 Aniqlashtirib bera olasizmi…? |
| comments.quick.onTrack | ✅ This is on track | ✅ Всё идёт по плану | ✅ Hammasi reja bo'yicha |
| filter.moreAssignees | More assignees | Другие исполнители | Boshqa ijrochilar |
| viewSettings.title | View settings | Настройки вида | Doska ko'rinishi sozlamalari |
| viewSettings.columnSize | Column size | Ширина столбцов | Ustun kengligi |
| viewSettings.columnSizeHint | Keep columns at a fixed width, or let them grow to fill the space. | Столбцы фиксированной ширины или растягиваются на всё свободное место. | Ustunlar qat'iy kenglikda qoladi yoki bo'sh joyni to'ldirish uchun kengayadi. |
| viewSettings.fixed | Fixed | Фиксированная | Qat'iy |
| viewSettings.flexible | Flexible | Гибкая | Moslashuvchan |
| viewSettings.scrolling | Scrolling | Прокрутка | Aylantirish |
| viewSettings.scrollingHint | Scroll inside each column, or scroll the whole board. | Прокрутка внутри каждого столбца или всей доски целиком. | Har bir ustun ichida yoki butun doskani aylantirish. |
| viewSettings.withinColumns | Within columns | Внутри столбцов | Ustunlar ichida |
| viewSettings.wholeBoard | Whole board | Вся доска | Butun doska |
| viewSettings.deviceNote | Saved on this device only. | Сохраняется только на этом устройстве. | Faqat shu qurilmada saqlanadi. |
| insights.title | Sprint insights | Аналитика спринта | Sprint tahlili |
| insights.intro | Your sprint's health and progress towards its goal. | Состояние спринта и продвижение к цели. | Sprint holati va maqsad sari borishi. |
| insights.sprint | Sprint: {{name}} | Спринт: {{name}} | Sprint: {{name}} |
| insights.attention | Needs attention | Требует внимания | E'tibor talab qiladi |
| insights.attentionEmpty | Nothing in this sprint is overdue. | В этом спринте нет просроченных задач. | Bu sprintda muddati o'tgan ishlar yo'q. |
| insights.notStarted | Not started | Не начато | Boshlanmagan |
| insights.epics | Epic progress | Прогресс эпиков | Epiklar bo'yicha jarayon |
| insights.noEpics | No epics in this sprint. | В этом спринте нет эпиков. | Bu sprintda epiklar yo'q. |

**Reuse these existing keys, and don't create duplicates:**
- `view.clearFilters`, `filter.by`, `members.unassigned`, `members.assignedToMe`
- `board.configureColumns`, `list.columns`, `list.visibleOf`
- `fields.work|priority|assignee|status|estimate|dueDate|created`
- `task.details`, `task.storyPoints`, `workflow.details`, `development.title`
- `sprint.progress|points|unestimated|noneActive|noneActiveHint|daysLeft|daysOverdue|endsToday|noDates`
- `columnCategory.in_progress|done`, `due.overdue`
- `attachments.add|none`, `subtasks.title|add|progress|empty`
- `common.cancel|reset`
