# Graph Report - TODO_app  (2026-08-19)

## Corpus Check
- 375 files · ~302,023 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1866 nodes · 2544 edges · 271 communities (172 shown, 99 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 114 edges (avg confidence: 0.79)
- Token cost: 559,500 input · 0 output

## Community Hubs (Navigation)
- Task Detail Modal
- Calendar Date Math
- Realtime Channel Verification
- Column Header And Menu
- Layered API Architecture
- Sidebar UI Primitives
- App TypeScript Config
- Board Ownership Contract
- Hand-Rolled Drag And Drop
- Board Invitations API
- Column Cache And API
- Agent Roles And Review Rules
- Comment Thread Data Layer
- View Filter And Group Pipeline
- shadcn Component Aliases
- Vite And Vitest Config
- Summary Dashboard Widgets
- Timeline Grid Layout
- Route Pages And Lazy Loading
- Board-Scoped Hooks
- Kanban Column And Card Types
- Optimistic Cache Invariants
- Milestone Working Agreements
- Rank Ordering And Drop Index
- Summary Statistics
- Board View Toolbar Controls
- Kanban Board Shell
- Invite People Modal
- Filter Option Builders
- RLS Policy House Rules
- View Milestones And Scope
- Membership And Invite Milestones
- Activity Logging Triggers
- Calendar View Components
- Member Row Components
- Ordering And Realtime Milestones
- Keyboard Drag Navigation
- Role Permission Rules
- Todo View Sorting
- Deferred Schema Decisions
- Build Dependencies
- Activity Text Formatting
- Spaces Data Layer
- App Root And Providers
- Query Keys And CodeGraph Rules
- Supabase Client And Activities
- Work Item Milestones
- Permission Model Matrices
- App Layout And Sidebar
- Todo Cache And Create
- Todo Query Layer
- Theme Provider And Tokens
- Membership RPC Verification
- npm Scripts
- Static Theme Assets
- List View Rows
- Board Members Data Layer
- Docs API
- Auth Context
- Deletion Rules
- Verify M3 16 Role Matrix
- Board Form Modal
- Drag Announcements
- Retry Policy
- Group Boards
- Registry
- Generated Database Types
- 20260810120000 Columns Todos Rls Via Mem
- CI Build Typecheck Step
- Axios
- Attachments Table
- Boards, Not Users
- Verify M3 15 Owner Immutability
- 20260811110000 Owner Immutability
- Category Select
- Activity Groups
- Todos Cache Test
- Trends
- Validation
- 20260811100000 Membership Mutations
- Anon GRANT ALL Exposure
- Package
- 20260814110000 Create Spaces
- Error Boundary
- Priorities
- Work Types
- 20260804000000 Baseline Schema
- Activities Table
- Profiles Table
- Use Board Modals
- Auth Api
- Query Client
- Calendar Grid
- Due Date
- Board Invites Table
- Column Limit Modal
- Delete Column Modal
- Comment Thread
- Profile Page
- Use Calendar Drop
- Insert Dense Test
- Scope
- Toasts
- 20260806093353 Timestamps
- 20260818100000 Create Comments
- Use Register
- Activity Drawer
- Use Panel
- Invite Page
- Comment Draft
- Profile Api
- Task Draft
- Relative Time
- 20260814122000 Rebalance Ranks
- Calendar Drop Resolution (closest Center
- 20260810100000 Backfill Owner Membership
- Login Form
- Register Form
- Header Todo Form
- Field Input
- Use Calendar View
- Use Timeline View
- Delete Confirm
- Invite Error
- To Card Content
- Task Key
- 20260810090000 Create Board Members
- 20260810093000 Board Membership Helpers
- 20260811090000 Membership Roster
- 20260811140000 Delete Column Rpc
- 20260814090000 Create Board Invites
- Mcp
- Mcp
- View Tabs
- Delete Board Modal
- Drawer
- Language Switcher
- Use Mobile
- Todo Form
- Button
- Modal
- Toast
- Use Todo Patch
- Done Flash
- Next Path
- Uuid
- 20260806090000 Create Boards
- 20260806094000 Provision New User
- Public Boards
- 20260806100619 Rls Board Ownership
- 20260807190500 Drop User Id
- 20260816090000 Activity Field Events
- Tsconfig
- @base Ui React
- Class Variance Authority
- Clsx
- @dnd Kit Core
- @dnd Kit Modifiers
- @dnd Kit React
- @dnd Kit Sortable
- @dnd Kit Utilities
- Activities Retention
- M6 11 Presence
- PH 09: Authenticated Retains TRUNCATE RE
- Eslint
- Eslint Plugin React Hooks
- @floating Ui React
- @fontsource Variable Geist
- @fontsource Variable Josefin Sans
- Globals
- Lucide React
- React
- React I18next
- React Router
- Shadcn
- @supabase Supabase Js
- Tailwind Merge
- Tailwindcss
- @tailwindcss Vite
- @tanstack Query Sync Storage Persister
- @tanstack React Query
- @tanstack React Query Persist Client
- Tw Animate Css
- Zustand
- Prettier
- Prettier Plugin Tailwindcss
- @types React
- @types React Dom
- Typescript Eslint
- Vite
- Vitest
- Checkbox
- Public Profiles
- Public Columns
- Database Design
- Cross Board Safety Of The Membership RPC
- Public Activities
- Public Boards
- Columns
- Columns
- Public Columns
- Public Todos
- Public Columns
- Public Todos
- Public Columns
- Public Todos
- Public Columns
- Public Todos
- Public Todos
- Public Todos
- Public Boards
- Public Todos
- Public Todos
- Public Boards
- Public Columns
- Public Todos
- Public Todos

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `useCardPopover()` - 17 edges
3. `compilerOptions` - 16 edges
4. `frontend` - 16 edges
5. `db-security` - 15 edges
6. `supabase` - 14 edges
7. `M3 — Members & Roles` - 14 edges
8. `test-author` - 14 edges
9. `addDays()` - 13 edges
10. `applyTodoEvent()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Only API Files May Import Supabase` --references--> `supabase`  [INFERRED]
  docs/API.md → src/services/api/supabase.ts
- `React Query As Single Source Of Server State` --references--> `queryClient`  [INFERRED]
  docs/FRONTEND.md → src/services/queryClient/queryClient.ts
- `useColumnReorder()` --calls--> `applyColumnMoved`  [EXTRACTED]
  src/hooks/useColumnReorder.ts → CLAUDE.md
- `useColumnReorder()` --calls--> `reorderColumns`  [EXTRACTED]
  src/hooks/useColumnReorder.ts → CLAUDE.md
- `The UI decides what to render, never what is allowed` --references--> `usePermissions()`  [EXTRACTED]
  .claude/agents/frontend.md → src/hooks/usePermissions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Permission enforcement stack (database-side)** — docs_implementation_plan_permission_model, docs_implementation_plan_security_definer_helpers, docs_implementation_plan_board_members_no_client_write, docs_implementation_plan_membership_mutation_rpcs, docs_implementation_plan_owner_immutability, docs_implementation_plan_role_matrix_verification, docs_implementation_plan_board_roster_rpc [EXTRACTED 1.00]
- **M6-A ordering migration (dense positions → fractional ranks)** — docs_implementation_plan_m6a_ordering, docs_implementation_plan_dense_integer_positions, docs_implementation_plan_fractional_ranks, docs_implementation_plan_single_row_rank_writes, docs_implementation_plan_rank_rebalancing, docs_implementation_plan_reorder_todos_rpc [EXTRACTED 1.00]
- **Shared view architecture (M16 + M17 contracts the later views fill)** — docs_implementation_plan_shared_view_pipeline, docs_implementation_plan_view_registry, docs_implementation_plan_view_scope, docs_implementation_plan_cross_board_query_shape, docs_implementation_plan_view_shell_contract, docs_implementation_plan_panel_as_search_param [EXTRACTED 1.00]
- **M3-14 Membership Mutation RPC Layer** — supabase_migrations_20260811100000_membership_mutations_board_role_rank, supabase_migrations_20260811100000_membership_mutations_is_board_owner, supabase_migrations_20260811100000_membership_mutations_add_board_member, supabase_migrations_20260811100000_membership_mutations_set_member_role, supabase_migrations_20260811100000_membership_mutations_remove_board_member, supabase_migrations_20260811100000_membership_mutations_leave_board [EXTRACTED 1.00]
- **Owner Invariant Enforcement Across RPC and Trigger Layers** — docs_rls_audit_owner_invariants, supabase_migrations_20260811100000_membership_mutations_is_board_owner, supabase_migrations_20260811110000_owner_immutability_board_members_owner_immutable, supabase_migrations_20260811110000_owner_immutability_boards_owner_immutable, supabase_migrations_20260810100000_backfill_owner_memberships_add_owner_membership, docs_rls_audit_a_function_cannot_constrain_a_writer_that_does_not_call_it [EXTRACTED 1.00]
- **Realtime Cache Reconciliation Flow** — src_services_realtime_useboardrealtime_useboardrealtime, src_services_realtime_events_applytodoevent, src_services_realtime_events_applycolumnevent, src_services_todos_cache_applytodoinserted, src_services_todos_cache_applytodoupdated, src_services_todos_cache_applytododeleted, docs_realtime_verification_never_refetch_on_an_event [EXTRACTED 1.00]
- **Component to PostgreSQL Layered Request Flow** — docs_api_ui_layer, docs_api_hooks_layer, docs_api_api_layer, docs_api_database_layer, docs_api_layered_request_flow [EXTRACTED 1.00]
- **Board Ownership Chain** — docs_architecture_board, docs_architecture_column, docs_architecture_todo, docs_architecture_ownership_rules, docs_architecture_rls_enforcement [EXTRACTED 1.00]
- **CI Validation Pipeline** — _github_workflows_ci_validate, _github_workflows_ci_lint_step, _github_workflows_ci_build_step, _github_workflows_ci_test_step [EXTRACTED 1.00]
- **Hand-rolled Kanban drag pipeline** — src_hooks_usekanbandnd_usekanbandnd, src_hooks_useboarddragend_useboarddragend, src_hooks_usecolumnreorder_usecolumnreorder, src_services_todos_usetododrop_usetododrop, src_components_kanban_dropzone_dropzone, src_components_kanban_columndropzone_columndropzone, src_components_kanban_kanbanboard_kanbanboard [EXTRACTED 1.00]
- **Optimistic mutation protocol (snapshot → patch → rollback)** — claude_optimistic_cache_patching, claude_cache_functions_pure, src_services_todos_cache_applytodomoved, src_services_columns_cache_applycolumnmoved, src_services_queryclient_querykeys_querykeys, src_services_todos_usetododrop_usetododrop, _claude_agents_test_author_cache_purity_tests [EXTRACTED 1.00]
- **Lead-directed agent division of labour** — _claude_agents_code_reviewer, _claude_agents_db_security, _claude_agents_frontend, _claude_agents_test_author, docs_implementation_plan, _claude_agents_code_reviewer_lead_is_owner [EXTRACTED 1.00]
- **Desktop/Mobile x Light/Dark Backdrop Matrix** — public_themes_bg_desktop_dark_backdrop, public_themes_bg_desktop_light_backdrop, public_themes_bg_mobile_dark_backdrop, public_themes_bg_mobile_light_backdrop [INFERRED 0.95]
- **Sun/Moon Toggle Swapping the Themed Backdrop** — public_icons_icon_sun_rays, public_icons_icon_moon_crescent, public_themes_bg_desktop_light_backdrop, public_themes_bg_desktop_dark_backdrop [INFERRED 0.85]

## Communities (271 total, 99 thin omitted)

### Community 0 - "Task Detail Modal"
Cohesion: 0.08
Nodes (18): Body(), Overlay(), TaskDetailModal(), useClosingValue(), TodoCard(), TodoCardProps, AssigneeControl(), DatePanel() (+10 more)

### Community 1 - "Calendar Date Math"
Cohesion: 0.10
Nodes (41): addDays(), addMonths(), CALENDAR_LAYOUTS, CalendarLayout, DAY_ITEM_LIMIT, format(), groupByDueDay(), instant() (+33 more)

### Community 2 - "Realtime Channel Verification"
Cohesion: 0.09
Nodes (25): Channel Reuse Inside the Leave Round Trip, The DELETE Asymmetry, M6-08 Channel Lifecycle, M6-09 Cache Handlers, M6-12 Concurrency, Never Refetch the Board on an Event, One Avatar per Person, Not per Tab, removeChannel, Not unsubscribe (+17 more)

### Community 3 - "Column Header And Menu"
Cohesion: 0.07
Nodes (20): Column categories as a fixed checked text set, Column limits are advisory, never blocking, Column titles are never translated, CollapsedColumn(), Props, ColumnHeader(), Props, RenameField() (+12 more)

### Community 4 - "Layered API Architecture"
Cohesion: 0.10
Nodes (23): API Service Layer, Database Layer, Filtering Belongs In Hooks, Hooks Layer, Layered Request Flow, API And Hook Naming Conventions, Only API Files May Import Supabase, UI Layer (+15 more)

### Community 5 - "Sidebar UI Primitives"
Cohesion: 0.09
Nodes (8): Sidebar(), SidebarMenuButton(), sidebarMenuButtonVariants, SidebarRail(), SidebarTrigger(), SidebarContext, SidebarContextProps, useSidebar()

### Community 6 - "App TypeScript Config"
Cohesion: 0.07
Nodes (27): @, DOM, src, src/components/pages/.tsx, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions (+19 more)

### Community 7 - "Board Ownership Contract"
Cohesion: 0.08
Nodes (27): Mutation Error Contract, Standard Mutation Lifecycle, Required Optimistic Updates, Realtime Updates Caches, Two-Sided Validation Policy, Board Entity, Board-Centric Architecture, Board Invite Entity (+19 more)

### Community 8 - "Hand-Rolled Drag And Drop"
Cohesion: 0.13
Nodes (22): Gate drag sensors as well as buttons, Droppable data.type as the dispatch key, Hand-rolled drag and drop (not @dnd-kit/sortable), ColumnDropZone(), Props, DropZone(), Props, BoardDragEndParams (+14 more)

### Community 9 - "Board Invitations API"
Cohesion: 0.13
Nodes (18): daysBetween(), expiresLabel(), inviteUrl(), isExpired(), AcceptedInvite, acceptInvite(), BoardInvite, CreatedInvite (+10 more)

### Community 10 - "Column Cache And API"
Cohesion: 0.16
Nodes (13): applyColumnDeleted(), applyColumnInserted(), applyColumnUpdated(), board(), col(), createColumn(), deleteColumn(), getColumns() (+5 more)

### Community 11 - "Agent Roles And Review Rules"
Cohesion: 0.11
Nodes (21): code-reviewer, Separate defects from preferences, state confidence, A rule enforced only in React is not enforced, The user is the Lead (helper agents never decide), Strictly read-only review (Bash for inspection only), Review priority order (authorization first), Spell out all four verbs; upsert hits INSERT and UPDATE policies, db-security has no Bash — applying is a human action (+13 more)

### Community 12 - "Comment Thread Data Layer"
Cohesion: 0.17
Nodes (14): applyCommentDeleted(), applyCommentInserted(), applyCommentUpdated(), byPostedAt(), addComment(), deleteComment(), fetchComments(), updateComment() (+6 more)

### Community 13 - "View Filter And Group Pipeline"
Cohesion: 0.11
Nodes (21): bucketBy(), countFilters(), DueBucket, FILTER_CATEGORIES, FILTER_LABELS, filterTodos(), GROUP_KEYS, GROUP_LABELS (+13 more)

### Community 14 - "shadcn Component Aliases"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 15 - "Vite And Vitest Config"
Cohesion: 0.09
Nodes (21): node, vite.config.ts, vitest.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module (+13 more)

### Community 16 - "Summary Dashboard Widgets"
Cohesion: 0.19
Nodes (13): scale(), TeamWorkload(), WorkDistribution(), DueSoon(), SHADES, StatusOverview(), DistributionRow(), SummaryCard() (+5 more)

### Community 17 - "Timeline Grid Layout"
Cohesion: 0.16
Nodes (13): HEADER_HEIGHT, RAIL_WIDTH, ROW_HEIGHT, TICK_MIN, trackColumns(), trackMinWidth(), Placement, TimelineGrid() (+5 more)

### Community 18 - "Route Pages And Lazy Loading"
Cohesion: 0.16
Nodes (8): Loading(), BoardIndexRoute(), BoardPage, InvitePage, ProfilePage, RegisterPage, ProtectedRoute(), PublicRoute()

### Community 19 - "Board-Scoped Hooks"
Cohesion: 0.16
Nodes (14): useBoardId(), BoardView, BoardViewMode, FILTER_PARAMS, readList(), readOne(), useBoardView(), useColumnReorder() (+6 more)

### Community 20 - "Kanban Column And Card Types"
Cohesion: 0.15
Nodes (15): TransitionPill, Props, CreateDraft, Props, TodoCreateForm(), Activity, Comment, IBoard (+7 more)

### Community 21 - "Optimistic Cache Invariants"
Cohesion: 0.14
Nodes (14): Cross-writer invariants belong in triggers or constraints, Test that cache functions do not mutate their inputs, KAN-{board_key} card labels, Boards own everything (M2 ownership model), Cache functions are pure and live outside the mutation closure, Client-minted todo uuids (no isOptimistic flag), Optimistic cache patching with snapshot rollback, public.assign_todo_board_key (+6 more)

### Community 22 - "Milestone Working Agreements"
Cohesion: 0.13
Nodes (18): AuthProvider — one subscription per page load, Backup procedure (Tier B only), Calibration — portfolio project sizing, Code Review Checklist, Definition of Done, Error boundaries and route errorElements, Expand → Backfill → Contract, Forward-only migrations via the CLI (+10 more)

### Community 23 - "Rank Ordering And Drop Index"
Cohesion: 0.22
Nodes (12): resolveDropIndex(), column(), order(), todo(), byRank(), neighboursAt(), RANK_GAP, rankBetween() (+4 more)

### Community 24 - "Summary Statistics"
Cohesion: 0.21
Nodes (14): categoryIndex(), categoryOfTodo(), DueSoonItem, dueSoonItems(), priorityDistribution(), recentCounts, Slice, statusDistribution() (+6 more)

### Community 25 - "Board View Toolbar Controls"
Cohesion: 0.20
Nodes (6): BoardFilters(), BoardSearch(), HEADER_CONTROL, HEADER_CONTROL_ACTIVE, HEADER_CONTROL_BADGE, HEADER_CONTROL_QUIET

### Community 26 - "Kanban Board Shell"
Cohesion: 0.17
Nodes (8): ViewNotice(), AddColumnButton(), Props, SortableColumn(), Swimlanes(), Props, TodoDragOverlay(), TodoItem()

### Community 27 - "Invite People Modal"
Cohesion: 0.21
Nodes (8): copyInviteLink(), DEFAULT_EXPIRY_DAYS, DEFAULT_INVITE_ROLE, EXPIRY_OPTIONS, INVITE_ROLE_OPTIONS, CreatedLink(), InviteDialog(), PendingInviteRow()

### Community 29 - "Filter Option Builders"
Cohesion: 0.14
Nodes (10): FilterOption, FilterOptionContext, filterOptions(), matchOptions(), ctx, DUE_BUCKETS, DUE_LABELS, FilterCategory (+2 more)

### Community 30 - "RLS Policy House Rules"
Cohesion: 0.14
Nodes (13): db-security, board_members has no client write policy, by design, Never sub-select board_members inside a policy (recursion → 500), Owner immutability I1–I6, SECURITY DEFINER house rules, The Lead allocates the migration timestamp slot, UPDATE policies need USING and WITH CHECK, Membership mutations go through supabase.rpc, never .from() (+5 more)

### Community 31 - "View Milestones And Scope"
Cohesion: 0.20
Nodes (15): Appendix E — Explicitly Out of Scope, Board-scoped query keys, No timezone conversion in the calendar, Client-side filtering over the cached board array, Cross-board data: per-board queries unioned client-side, Jira as functional reference, not UI reference, M11 — Backlog & Views, M12 — Search & Filtering (+7 more)

### Community 32 - "Membership And Invite Milestones"
Cohesion: 0.22
Nodes (15): board_invites and the invite RPCs, board_members is never client-writable, board_roster RPC — explicit column exposure, Boards own everything (ownership moves from user to board), GitHub Flow with milestone integration branches, leave_board — consent as a separate operation, M2 — Boards, M3 — Members & Roles (+7 more)

### Community 33 - "Activity Logging Triggers"
Cohesion: 0.13
Nodes (11): public.log_column_activity, public.log_member_activity, public.log_todo_activity, board_members_log_activity, columns_log_activity, public.activities, public.log_todo_activity(), public.boards (+3 more)

### Community 34 - "Calendar View Components"
Cohesion: 0.22
Nodes (6): CalendarChip(), CalendarGrid(), CalendarNav(), CalendarView(), DayCell(), UndatedStrip()

### Community 35 - "Member Row Components"
Cohesion: 0.26
Nodes (9): MemberActions(), MemberIdentity(), memberInitial(), memberName(), MemberRow(), ROLE_STYLE_FALLBACK, ROLE_STYLES, roleLabel() (+1 more)

### Community 36 - "Ordering And Realtime Milestones"
Cohesion: 0.21
Nodes (14): Build order (not milestone number order), Dense integer positions, Fractional ranks (double precision), M13 — Configurable Workflow, M6 — Realtime, M6-A — Ordering by rank, M6-B — Realtime channels, Pure cache-update functions (+6 more)

### Community 37 - "Keyboard Drag Navigation"
Cohesion: 0.26
Nodes (10): ARROW_KEYS, ArrowKey, GapRef, inColumn(), isArrowKey(), nearestUsable(), nextColumnGap(), nextTodoGap() (+2 more)

### Community 38 - "Role Permission Rules"
Cohesion: 0.29
Nodes (12): assignableRoles(), BOARD_ROLES, BoardRole, canActOnMember(), canDeleteComment(), canEditComment(), isBoardRole(), NO_PERMISSIONS (+4 more)

### Community 39 - "Todo View Sorting"
Cohesion: 0.14
Nodes (8): EMPTY_FILTERS, normalise(), orderByBoard(), searchTodos(), sortTodos(), sortValue(), COLUMNS, TodoFilters

### Community 40 - "Deferred Schema Decisions"
Cohesion: 0.18
Nodes (13): Appendix B — Deferred Decisions, Appendix D — Forward Schema Decisions, Board filing rule (only the owner files, and only into a space they own), boards.key_prefix, Drop todos.status / previous_status, M14 — Foundation Cleanup, M15 — Spaces & Boards, M8 — Boards UX (+5 more)

### Community 41 - "Build Dependencies"
Cohesion: 0.15
Nodes (13): @eslint/js, eslint-plugin-react-refresh, devDependencies, @eslint/js, eslint-plugin-react-refresh, supabase, @types/node, typescript (+5 more)

### Community 42 - "Activity Text Formatting"
Cohesion: 0.23
Nodes (9): ActivityContext, ActivityDetail, ActivityLine, describeActivity(), itemLabel(), num(), personLabel(), priorityDetail() (+1 more)

### Community 43 - "Spaces Data Layer"
Cohesion: 0.26
Nodes (8): createSpace(), deleteSpace(), getSpaces(), updateSpace(), useCreateSpace(), useDeleteSpace(), useSpaces(), useUpdateSpace()

### Community 44 - "App Root And Providers"
Cohesion: 0.20
Nodes (8): useQueryClient(), never the module-level singleton, Root Mount Point, router, main.tsx, AuthProvider(), ToastProvider(), queryClient, retryPolicy

### Community 45 - "Query Keys And CodeGraph Rules"
Cohesion: 0.17
Nodes (10): .claude/CLAUDE.md (CodeGraph project instructions), CodeGraph (indexed code knowledge graph), codegraph_explore, One folder per feature under src/services, Predictable Query Keys, EMPTY_COLUMNS, useTodosByColumns(), COMMENT_ROOT (+2 more)

### Community 46 - "Supabase Client And Activities"
Cohesion: 0.26
Nodes (7): Supabase env vars inlined at build time, ACTIVITY_PAGE, fetchActivities(), useActivities(), supabase, uploadAvatar(), useUploadAvatar()

### Community 47 - "Work Item Milestones"
Cohesion: 0.24
Nodes (12): activities table (trigger-written), Avatar storage path hole, board_id denormalised onto every board-scoped child table, comments table, M10 — Work Item Depth, M17 — Product Redesign, M18 — Activity & Overview, M5 — Work Item Model (+4 more)

### Community 48 - "Permission Model Matrices"
Cohesion: 0.20
Nodes (12): Board content matrix, Comment matrix, Composite FK — a work item's column must belong to its board, delete_column RPC (SECURITY INVOKER), Four roles — viewer → editor → admin → owner, Membership matrix, Permission Model (authoritative), Postgres is the authority; frontend checks are UX only (+4 more)

### Community 49 - "App Layout And Sidebar"
Cohesion: 0.20
Nodes (5): AppSidebar(), Item, WORKSPACE, BoardsSection(), Dialog

### Community 50 - "Todo Cache And Create"
Cohesion: 0.30
Nodes (9): applyTodoConfirmed(), applyTodoInserted(), insertDense(), addTodo(), moveTodo(), reorderTodos(), AddTodoInput, AddTodoVars (+1 more)

### Community 51 - "Todo Query Layer"
Cohesion: 0.24
Nodes (7): fetchTodo(), fetchTodos(), TODO_LIST_FIELDS, TodoPatch, useTodo(), useTodos(), TodoRow

### Community 52 - "Theme Provider And Tokens"
Cohesion: 0.24
Nodes (7): Theme as a dark class plus CSS-var design tokens, Visual Design Goals, Inline Theme Bootstrap Script, Theme, ThemeContext, ThemeProvider(), src/styles/global.css

### Community 53 - "Membership RPC Verification"
Cohesion: 0.22
Nodes (8): M3-14 Membership Mutation RPCs, Role Hierarchy as Rank Arithmetic, add_board_member(uuid, uuid, text), board_role_rank(text), is_board_owner(uuid, uuid), leave_board(uuid), remove_board_member(uuid, uuid), set_member_role(uuid, uuid, text)

### Community 54 - "npm Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:diff, db:pull, db:push, db:types, dev, lint (+3 more)

### Community 55 - "Static Theme Assets"
Cohesion: 0.25
Nodes (11): Check Icon (11x9 white checkmark stroke), Cross Icon (18x18 slate #494C6B X), Moon Icon (26x26 white crescent), Sun Icon (26x26 white disc with rays), Desktop Dark Backdrop (night colonnade, blue-to-magenta wash), Light/Dark Theme Asset Pairing, Desktop Light Backdrop (mountain ridge, pink-to-blue wash), Mobile Dark Backdrop (cropped night colonnade) (+3 more)

### Community 57 - "List View Rows"
Cohesion: 0.27
Nodes (3): LIST_GRID, LIST_MIN_WIDTH, ListRow()

### Community 58 - "Board Members Data Layer"
Cohesion: 0.35
Nodes (8): BoardMember, fetchBoardMembers(), removeBoardMember(), updateMemberRole(), useBoardMembers(), useMemberMutation(), useRemoveMember(), useUpdateMemberRole()

### Community 59 - "Docs API"
Cohesion: 0.20
Nodes (10): frontend, Frontend file ownership boundaries, The UI decides what to render, never what is allowed, @/ path alias declared in two places, Dense integer positions, rewrite the whole array, npm run build is the only typecheck (noUnusedLocals), docs/API.md, docs/FRONTEND.md (+2 more)

### Community 60 - "Auth Context"
Cohesion: 0.33
Nodes (6): Contexts split into their own modules for react-refresh, AuthContext, AuthState, useAuth(), fetchProfile(), useProfile()

### Community 61 - "Deletion Rules"
Cohesion: 0.20
Nodes (10): Deletion Rules, An RLS Denial Is Not an Error, The Cascade Hatch (allow delete only when the parent is already gone), M3-11 Atomic Column Deletion, The NULL Rank Trap, ON CONFLICT DO NOTHING Retracted for Owner Rows, public.enforce_owner_membership_immutable, add_owner_membership() trigger function (+2 more)

### Community 62 - "Verify M3 16 Role Matrix"
Cohesion: 0.22
Nodes (4): AUTO / LIVE / MANUAL Evidence Marks, Realtime Verification (M6-B), Mutation-Tested Verification Harness, Replica-Not-Production Verification Gap

### Community 63 - "Board Form Modal"
Cohesion: 0.22
Nodes (7): BoardFormModal(), handleSubmit(), KanbanColumn(), handleOutsideClick(), onClose(), SpaceFormModal(), handleSubmit()

### Community 64 - "Drag Announcements"
Cohesion: 0.38
Nodes (8): announceCancelled(), announceDropped(), announceMovedOver(), announcePickedUp(), describeColumnPosition(), describePosition(), itemLabel(), SCREEN_READER_INSTRUCTIONS

### Community 65 - "Retry Policy"
Cohesion: 0.33
Nodes (8): codeOf(), isRetryableError(), MAX_QUERY_RETRIES, RETRYABLE_CLIENT_STATUSES, retryQuery(), statusOf(), TRANSIENT_SQLSTATE_CLASSES, TRANSIENT_SQLSTATES

### Community 66 - "Group Boards"
Cohesion: 0.24
Nodes (5): byTitle(), groupBoardsBySpace(), SpaceGroup, personal, work

### Community 67 - "Registry"
Cohesion: 0.31
Nodes (8): capabilitiesOf(), isViewMode(), reorderingViews(), VIEW_MODES, ViewCapabilities, ViewDefinition, ViewMode, VIEWS

### Community 68 - "Generated Database Types"
Cohesion: 0.20
Nodes (9): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables, TablesInsert (+1 more)

### Community 69 - "20260810120000 Columns Todos Rls Via Mem"
Cohesion: 0.22
Nodes (8): Required migration file sections (prior state, rollback, verification), Tier A / Tier B migration classification, Empty array from a denied read is a pass; 42501 is a pass for a denied write, Forward-only migrations (expand → backfill → contract), Schema changes go through the CLI, never the SQL editor, public.accessible_board_ids(), public.board_members, public.boards

### Community 70 - "CI Build Typecheck Step"
Cohesion: 0.22
Nodes (9): CI Build / Typecheck Step, CI Lint Step, CI Test Step, CI validate Job, Cursor Pagination Policy, Typed API Return Types, Frontend Performance Guidelines, Type-Aware ESLint Configuration (+1 more)

### Community 71 - "Axios"
Cohesion: 0.22
Nodes (9): axios, i18next, dependencies, axios, i18next, radix-ui, react-dom, radix-ui (+1 more)

### Community 72 - "Attachments Table"
Cohesion: 0.25
Nodes (9): attachments table, columns table, comments table, Midnight-UTC timestamptz Date Storage, todos table, todos_date_range_check, Client-Minted UUID as the Echo Identity, M6-10 Echo Suppression (+1 more)

### Community 73 - "Boards, Not Users"
Cohesion: 0.22
Nodes (9): Boards, Not Users, comments.board_id Denormalisation, M6-07 Publication and Permissions, Named-Table Publication, M2-08 Board-Based Ownership Model, Permissive Policies Are OR'd Together, PITR Disabled on the Linked Project, The Single Swap Point (+1 more)

### Community 74 - "Verify M3 15 Owner Immutability"
Cohesion: 0.22
Nodes (5): A Function Cannot Constrain a Writer That Does Not Call It, M3-15 Owner Immutability Triggers, Owner Invariants I1-I6, Residual Trigger Bypasses, Unauthorized Migration Apply (process note)

### Community 75 - "20260811110000 Owner Immutability"
Cohesion: 0.22
Nodes (7): M3-17 Board Settings by Role, A Policy Cannot Express "Unchanged", public.enforce_board_owner_immutable, boards_owner_immutable, public.enforce_owner_membership_immutable(), public.boards, public.profiles

### Community 76 - "Category Select"
Cohesion: 0.25
Nodes (5): CategorySelect(), Props, CreateColumnDialog(), CreateColumnModal(), CreateColumnModalProps

### Community 77 - "Activity Groups"
Cohesion: 0.36
Nodes (6): ActivityDay, groupActivitiesByDay(), labelFor(), localDay(), shiftDay(), NOW

### Community 78 - "Todos Cache Test"
Cohesion: 0.31
Nodes (5): applyTodoDeleted(), board(), todo(), deleteTodo(), useDeleteTodo()

### Community 79 - "Trends"
Cohesion: 0.28
Nodes (4): activityTrend(), NOW, trendPeak(), TrendPoint

### Community 80 - "Validation"
Cohesion: 0.42
Nodes (7): AuthFieldErrors, hasErrors(), PASSWORD_MIN_LENGTH, validateAuthForm(), validateEmail(), validatePassword(), validation

### Community 81 - "20260811100000 Membership Mutations"
Cohesion: 0.22
Nodes (3): public.is_board_owner(), public.board_members, public.boards

### Community 82 - "Anon GRANT ALL Exposure"
Cohesion: 0.25
Nodes (7): anon GRANT ALL Exposure, Avatar Path Ownership Gap, M0-07 RLS Remediation, No Authorization Boundary (M0-06 verdict), RLS and Storage Policy Audit (M0-06), Upsert Reordering Needs Both INSERT and UPDATE Policies, shift_completed_positions(p_user_id uuid)

### Community 83 - "Package"
Cohesion: 0.25
Nodes (7): name, overrides, react-router-dom, private, react-router, type, version

### Community 84 - "20260814110000 Create Spaces"
Cohesion: 0.25
Nodes (5): public, public.boards_space_ownership, boards_space_ownership, public.spaces, public.profiles

### Community 85 - "Error Boundary"
Cohesion: 0.25
Nodes (3): ErrorBoundary, Props, State

### Community 87 - "Priorities"
Cohesion: 0.43
Nodes (6): PRIORITIES, Priority, PRIORITY_OPTIONS, priorityOf(), priorityRank(), toPriority()

### Community 88 - "Work Types"
Cohesion: 0.43
Nodes (6): DEFAULT_WORK_TYPE, toWorkType(), WORK_TYPE_OPTIONS, WORK_TYPES, WorkType, workTypeOf()

### Community 89 - "20260804000000 Baseline Schema"
Cohesion: 0.29
Nodes (4): "auth"."users", "public"."columns", "public"."profiles", "public"."todos"

### Community 90 - "Activities Table"
Cohesion: 0.29
Nodes (7): activities table, (entity_type, action) Checked as a Pair, An Entry Must Explain Itself After Its Row Is Deleted, Index Set, No Client Write Path to activities, Record the Actor, Never Infer It at Read Time, log_todo_activity() trigger function

### Community 91 - "Profiles Table"
Cohesion: 0.29
Nodes (7): profiles table, No Payload Exposes an Unselectable Column, Defense in Depth on board_members Privileges, M3-13 Board Roster RPC Boundary, PH-08: anon holds ALL on public.profiles, RLS Filters Rows, Not Columns, Postgres Checks Table Privileges Before Row Security

### Community 92 - "Use Board Modals"
Cohesion: 0.29
Nodes (3): KanbanBoard(), useBoardDragEnd(), useBoardModals()

### Community 94 - "Auth Api"
Cohesion: 0.48
Nodes (4): signIn(), signOut(), useLogin(), useLogout()

### Community 95 - "Query Client"
Cohesion: 0.38
Nodes (6): ErrorMeta, messageOf(), mutationCache, queryCache, Register, @tanstack/react-query

### Community 96 - "Calendar Grid"
Cohesion: 0.48
Nodes (5): CalendarDay, dayToMs(), monthGrid(), shiftMonth(), toDay()

### Community 97 - "Due Date"
Cohesion: 0.62
Nodes (5): dueStatus, formatDue(), fromCalendarDay(), toCalendarDay(), todayISO()

### Community 98 - "Board Invites Table"
Cohesion: 0.33
Nodes (6): board_invites table, board_members table, boards table, Design Rules, labels and todo_labels tables, Membership Revocation Window on an Open Channel

### Community 99 - "Column Limit Modal"
Cohesion: 0.40
Nodes (5): ColumnLimitDialog(), handleSubmit(), ColumnLimitModal(), parseLimit(), Props

### Community 100 - "Delete Column Modal"
Cohesion: 0.33
Nodes (4): DeleteColumnDialog(), handleSubmit(), DeleteColumnModal(), Props

### Community 103 - "Use Calendar Drop"
Cohesion: 0.60
Nodes (4): applyTodoUpdated(), updateTodo(), useCalendarDrop(), useUpdateTodo()

### Community 105 - "Scope"
Cohesion: 0.40
Nodes (3): boardIdsInScope(), boards, ViewScope

### Community 106 - "Toasts"
Cohesion: 0.33
Nodes (5): toast, ToastMessage, ToastStore, ToastVariant, useToasts

### Community 107 - "20260806093353 Timestamps"
Cohesion: 0.47
Nodes (4): boards_set_updated_at, columns_set_updated_at, public.set_updated_at, todos_set_updated_at

### Community 108 - "20260818100000 Create Comments"
Cohesion: 0.33
Nodes (5): comments_set_updated_at, public.comments, public.profiles, public.set_updated_at, public.todos

### Community 109 - "Use Register"
Cohesion: 0.60
Nodes (4): New users provisioned by RPC, not by the client, signUp(), useRegister(), provision_new_user()

### Community 112 - "Use Panel"
Cohesion: 0.50
Nodes (4): isPanel(), PanelKey, PANELS, usePanel()

### Community 114 - "Comment Draft"
Cohesion: 0.70
Nodes (3): commentValue(), editedValue(), isEdited()

### Community 115 - "Profile Api"
Cohesion: 0.60
Nodes (3): updateProfile(), useUpdateProfile(), ISupabaseProfile

### Community 116 - "Task Draft"
Cohesion: 0.80
Nodes (3): descriptionChanged(), descriptionValue(), titleValue()

### Community 118 - "20260814122000 Rebalance Ranks"
Cohesion: 0.40
Nodes (3): public.rebalance_column_ranks(), public.columns, public.todos

### Community 119 - "Calendar Drop Resolution (closest Center"
Cohesion: 0.50
Nodes (4): Calendar drop resolution (closestCenter over day cells), Hand-rolled drag and drop, M9 — Quality, React Compiler removed (M9-04 decision)

### Community 126 - "Field Input"
Cohesion: 0.50
Nodes (3): FIELD_INPUT, FIELD_INPUT_INVALID, FORM_SUBMIT

### Community 127 - "Use Calendar View"
Cohesion: 0.67
Nodes (3): CalendarView, isDay(), useCalendarView()

### Community 128 - "Use Timeline View"
Cohesion: 0.67
Nodes (3): isDay(), TimelineView, useTimelineView()

### Community 134 - "20260810090000 Create Board Members"
Cohesion: 0.50
Nodes (3): public.board_members, public.boards, public.profiles

### Community 135 - "20260810093000 Board Membership Helpers"
Cohesion: 0.67
Nodes (3): public.board_role(), public.is_board_member(), public.board_members

### Community 136 - "20260811090000 Membership Roster"
Cohesion: 0.50
Nodes (3): public.board_roster(), public.board_members, public.profiles

### Community 137 - "20260811140000 Delete Column Rpc"
Cohesion: 0.50
Nodes (3): public.delete_column(), public.columns, public.todos

### Community 138 - "20260814090000 Create Board Invites"
Cohesion: 0.50
Nodes (3): public.board_invites, public.boards, public.profiles

### Community 157 - "Public Boards"
Cohesion: 1.00
Nodes (3): public.boards, public.columns, public.todos

## Ambiguous Edges - Review These
- `board_roster RPC — explicit column exposure` → `Client-minted UUID todo ids`  [AMBIGUOUS]
  docs/IMPLEMENTATION_PLAN.md · relation: semantically_similar_to
- `codegraph_explore` → `One folder per feature under src/services`  [AMBIGUOUS]
  .claude/CLAUDE.md · relation: conceptually_related_to
- `@/ path alias declared in two places` → `byPosition`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to
- `Check Icon (11x9 white checkmark stroke)` → `Favicon 32x32 (small blue mark, illegible at size)`  [AMBIGUOUS]
  public/themes/favicon-32x32.png · relation: semantically_similar_to
- `Favicon 32x32 (small blue mark, illegible at size)` → `Light/Dark Theme Asset Pairing`  [AMBIGUOUS]
  public/themes/favicon-32x32.png · relation: conceptually_related_to

## Knowledge Gaps
- **317 isolated node(s):** `codegraph`, `codegraph`, `$schema`, `style`, `rsc` (+312 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **99 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `board_roster RPC — explicit column exposure` and `Client-minted UUID todo ids`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `codegraph_explore` and `One folder per feature under src/services`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `@/ path alias declared in two places` and `byPosition`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Check Icon (11x9 white checkmark stroke)` and `Favicon 32x32 (small blue mark, illegible at size)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Favicon 32x32 (small blue mark, illegible at size)` and `Light/Dark Theme Asset Pairing`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `supabase` connect `Supabase Client And Activities` to `Layered API Architecture`, `CI Build Typecheck Step`, `Board Invitations API`, `Comment Thread Data Layer`, `Query Keys And CodeGraph Rules`, `Profile Api`, `Todo Query Layer`, `Board Members Data Layer`, `Auth Context`, `Auth Api`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `CLAUDE.md (project architecture guide)` connect `Agent Roles And Review Rules` to `20260810120000 Columns Todos Rls Via Mem`, `Hand-Rolled Drag And Drop`, `Query Keys And CodeGraph Rules`, `Optimistic Cache Invariants`, `Error Boundary`, `Docs API`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._