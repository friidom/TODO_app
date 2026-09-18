# Module conventions

Read this before adding a module. Established in B6 (§10.3 of
`docs/BACKEND_MIGRATION_PLAN.md`).

## Layers

`routes → controller → service → repo`

| Layer | Responsible for | Must never |
|---|---|---|
| `*.routes.ts` | URL, verb, which middleware runs | contain logic |
| `*.controller.ts` | read `req`, call one service function, shape `res` | query the database, decide permissions |
| `*.service.ts` | business rules, transactions, realtime emits | touch `req`/`res` |
| `*.repo.ts` | all SQL | contain rules |

## Every board-scoped repo function takes `boardId` first, and required

```ts
export function findByBoard(boardId: string): Promise<TodoRow[]>
export function findOne(boardId: string, todoId: string): Promise<TodoRow | null>
export function remove(boardId: string, todoId: string): Promise<void>
//                     ^^^^^^^ always first, always required
```

Not "should take" — *takes*, as a matter of signature, so omitting it is a
compile error rather than a code review.

This is one of the two compensating controls for the ~30 RLS policies that no
longer exist. The audit lists the queries that were one missing `WHERE` away
from being a leak; this is what stops them. Scoping by `(boardId, id)` rather
than `id` also reproduces a property the frontend already relies on: **a
pasted id from another board must 404, not return the row.**

`boardId` comes from `req.board.id`, which `boardAccess` set. Never from
`req.params`, `req.body` or `req.query` — by the time a handler runs, the
board id in the URL has already been validated against membership, and
reading it again bypasses that.

## The role matrix is a table, not a series of `if`s

`lib/permissions.ts` is the authority. Rank checks go through
`requireRole(...)` in the chain; rules rank cannot express — the author of a
comment, the uploader of an attachment — call `canDeleteComment` /
`canDeleteAttachment` from the **service**, never from middleware.

`src/services/members/permissions.ts` is the frontend's mirror of that file.
The two are kept honest by `permissions-matrix.json` at the repo root and the
`permissions.parity.test.ts` in each package; if they drift, one of those
tests fails.

## The middleware chain

```ts
requireAuth, boardAccess, requireRole("editor"), validate(schema), handler
```

- `boardAccess` answers **404, not 403**, for a non-member, so that
  non-membership is indistinguishable from non-existence. Do not "fix" this.
- `requireRole` answers **403**, because membership is already established by
  the time it runs.
- A route mounted behind `boardAccess` with no `:boardId` and no child id is a
  **500** — that is a wiring bug, not something a client did.
- Where several ids are in the path, **every one of them is resolved** and they
  must all name the same board. Any disagreement is the same 404.

### `validate` is not optional

A controller reads `req.body as SomeInput`. That cast is only sound because a
`validate({ body: someSchema })` sits in front of it — TypeScript cannot check
it. **A route that omits `validate` hands its service unvalidated input wearing
a validated type.** Keep the schema and the route together.

### Nested routers need `mergeParams: true`

```ts
const boardRouter = Router({ mergeParams: true }); //  ← without this…
app.use("/boards/:boardId", boardRouter);
```

Without it, `req.params.boardId` is undefined inside the child router, so
`boardAccess` finds nothing to resolve and answers **500**. It fails loudly
rather than silently authorizing, but it fails.

## One function answers "which boards may this actor see"

`modules/boards/boards.repo.ts#accessibleBoardIds`. Widening access later is an
edit there and nowhere else. Never inline that query.

## Every write that fires a stamping trigger runs inside `withActor`

```ts
await withActor(actorId, async (tx) => { … });   // not prisma.$transaction
```

Five trigger functions read `current_setting('app.actor_id', true)`. A write to
`todos`, `columns`, `boards`, `board_members` or `board_invites` outside
`withActor` still **succeeds** — it just records `actor_id = null`, and the
activity feed says "Unknown moved KAN-4". It fails silently, so it does not
show up as a bug until someone reads the feed.

`withActor` *is* a transaction. Do not open another inside it.

## `bigint` and `Decimal` are converted before they reach `res.json`

`columns.position` and `todos.position` are `int8`, so Prisma returns a
`bigint` — and `JSON.stringify` **throws** on one. `todos.estimate` is
`numeric`, so Prisma returns a `Decimal`, which serialises to the *string*
`"5"` where the client's contract says `5`.

`lib/numeric.ts#toNumber` is the conversion, and the service is where it runs.
A global `json replacer` looks like the tidier fix and cannot work: stringify
calls `toJSON` before the replacer, so a `Decimal` has already become a string
by the time one could see it.

## `sprints` may never be selected by `board_id` as if it were unique

`sprints_one_active_per_board` is a **partial** unique index (`where state =
'active'`). Prisma introspects it as a plain unique, so

```ts
prisma.sprints.findUnique({ where: { board_id } })   // ← type-checks, and is wrong
prisma.boards.findUnique({ include: { sprints: true } })  // ← returns ONE sprint
```

A board has many sprints and at most one *active* one. Use `findMany`, and read
the running one with `findFirst({ where: { board_id, state: "active" } })`.

## Route declaration order is load-bearing

Express matches in declaration order, so a literal segment must be declared
before the parameter that would swallow it:

- `/members/me` before `/members/:userId`
- `/invites/mine` before `/invites/:token`
- `/notifications/unread-count`, `/read`, `/read-all` before any `/:id`

## `boardAccess({ mayNotExist })` — the one exception, and its price

`PATCH`-as-upsert cannot use the strict resolver: §12.3 requires a PATCH on a
todo whose insert is still in flight to **create** the row, and the strict
resolver 404s it before the handler runs.

```ts
boardRouter.patch(
  "/todos/:todoId",
  requireAuth,
  boardAccess({ mayNotExist: "todoId" }),
  requireRole("editor"),
  validate({ body: todoPatchSchema }),
  controller.upsert,
);
```

The named id is then **never looked up**, so this middleware no longer proves
it belongs to `req.board.id`. The handler must scope the write by
`(id, board_id)` — the compound unique exists on `todos` and `columns` for
exactly this. An upsert keyed on `id` alone lets one board overwrite another's
row. The route must also carry `:boardId`, or there is nothing left to resolve
and it answers 500.
