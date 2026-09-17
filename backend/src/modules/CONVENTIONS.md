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
