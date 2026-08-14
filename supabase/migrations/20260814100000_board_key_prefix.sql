-- M14 · Per-board task key prefix. SAFE. Tier A.
--
-- Cards are labelled KAN-1, KAN-2 … and the "KAN" is a string literal in three
-- React components. `boards.next_key` allocates the *number* per board (M2-21),
-- so two boards already count independently — but both render the same prefix.
-- Today that is invisible, because every account has exactly one board. M15
-- lets a user create a second, and on that day KAN-1 stops naming one card.
--
-- A task key is an identifier people paste into messages and rely on, so the
-- prefix has to be settled before the keys multiply, not after. Appendix D of
-- docs/IMPLEMENTATION_PLAN.md has carried this decision since the 2026-08-10
-- audit under the trigger "before keys appear anywhere outside the card". M14
-- is where it lands — one milestone ahead of the one that would break it.
--
-- On `boards`, not on a space or a workspace: `next_key` is already a boards
-- column, and a prefix living anywhere else would be a join to render a card.
-- The two halves of a key belong on the same row.
--
-- Corollary, recorded because the opposite is a tempting tidy-up later: moving
-- a board between spaces (M15) must NOT renumber or re-prefix anything. The key
-- is the board's, not its container's.


-- 1. The column ----------------------------------------------------------------
--
-- Same shape as `todos.type` (M5): default plus NOT NULL in one statement. In
-- Postgres 11+ that is a catalog-only change — the fast-default optimisation
-- means existing rows are not rewritten and the table is not scanned — and the
-- default is what populates them, so every board reads 'KAN' immediately.
--
-- That IS the backfill. A separate `update boards set key_prefix = 'KAN'` would
-- rewrite the table to reach a state the default already guarantees, and Rule 3
-- exists to keep a backfill from destroying data, which this cannot.
--
-- NOT NULL is safe in the same statement for the same reason: no row can be
-- null at any point, so the constraint has nothing to reject. It also means no
-- reader ever handles a null prefix — the client renders `${prefix}-${n}` with
-- no fallback branch to get wrong.
--
-- 'KAN' preserves every key that already exists. No card is renumbered, no
-- label changes. This migration is meant to be invisible.

alter table public.boards
  add column key_prefix text not null default 'KAN';


-- 2. The format constraint ------------------------------------------------------
--
-- The prefix is rendered into a label people read and type. Unconstrained it
-- accepts '', a newline, an emoji, or two hundred characters — each of those a
-- rendering bug in a leaf component that cannot defend against it, and none of
-- them catchable by TypeScript, which only knows the column is `string`.
--
-- Two to ten characters; uppercase letters and digits; first character a
-- letter. The leading-letter rule is what keeps `KAN-12` unambiguous: the
-- hyphen is the separator, so digits inside a prefix are readable, but a prefix
-- that could *start* with one invites reading the key from the wrong end.
--
-- In the database rather than in the form, because the form is not the only
-- writer: M15's board settings, provision_new_user(), and any future import all
-- reach this column, and Permission Model rule 6 puts an invariant every writer
-- must hold in a constraint rather than in one caller.

alter table public.boards
  add constraint boards_key_prefix_format
  check (key_prefix ~ '^[A-Z][A-Z0-9]{1,9}$');


-- 3. Rollback -------------------------------------------------------------------
--
-- Forward-fix, and today it is complete: nothing read this column before this
-- migration, so dropping it restores the prior schema exactly.
--
--   alter table public.boards drop constraint boards_key_prefix_format;
--   alter table public.boards drop column key_prefix;
--
-- One thing that stops being true later, stated now: once M15 ships board
-- settings and a board has chosen a prefix other than 'KAN', dropping the
-- column destroys that choice and the reversal is no longer free.
