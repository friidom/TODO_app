import { Router } from "express";

import { authRoutes } from "../modules/auth/auth.routes.js";
import { boardCollectionRoutes, boardItemRoutes } from "../modules/boards/boards.routes.js";
import { boardColumnsRoutes, columnsRoutes } from "../modules/columns/columns.routes.js";
import {
  boardInviteesRoutes,
  boardInvitesRoutes,
  invitesRoutes,
} from "../modules/invites/invites.routes.js";
import { membersRoutes } from "../modules/members/members.routes.js";
import { boardTodosRoutes, todosRoutes } from "../modules/todos/todos.routes.js";
import { spacesRoutes } from "../modules/spaces/spaces.routes.js";
import { usersRoutes } from "../modules/users/users.routes.js";

export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ version: "v1", status: "ok" });
});

// The whole URL tree lives here, so "what is mounted where" is one file to
// read. A module exports its routers; it does not mount itself.
//
// mergeParams is not optional on anything under /boards/:boardId — without it
// req.params.boardId is undefined in the child, boardAccess finds nothing to
// resolve, and the route answers 500 (CONVENTIONS.md).
const boardScoped = Router({ mergeParams: true });

apiRouter.use("/auth", authRoutes);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/spaces", spacesRoutes);
apiRouter.use("/invites", invitesRoutes);
apiRouter.use("/columns", columnsRoutes);
apiRouter.use("/todos", todosRoutes);

// Order matters only in that the collection router has no matching route for
// /boards/<id>, so those fall through to boardScoped.
apiRouter.use("/boards", boardCollectionRoutes);
apiRouter.use("/boards/:boardId", boardScoped);

boardScoped.use("/", boardItemRoutes);
boardScoped.use("/members", membersRoutes);
boardScoped.use("/invites", boardInvitesRoutes);
boardScoped.use("/invitees", boardInviteesRoutes);
boardScoped.use("/columns", boardColumnsRoutes);
boardScoped.use("/todos", boardTodosRoutes);
