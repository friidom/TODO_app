-- 0022 — spaces.workflow_enabled goes away. CONTRACT.
--
-- 0021 has copied every value onto the boards that were governed by it, and
-- todos.service.ts now reads the board. Leaving the column would leave a second
-- place for the answer to be written and a reader to disagree, which is the
-- split brain 0020's header set out to remove.
--
-- Forward-only, like every migration here: reversing this means writing a new
-- one, and the values are recoverable from boards.workflow_enabled.

alter table spaces drop column workflow_enabled;
