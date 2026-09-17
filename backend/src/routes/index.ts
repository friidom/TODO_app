import { Router } from "express";

import { authRoutes } from "../modules/auth/auth.routes.js";

export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ version: "v1", status: "ok" });
});

apiRouter.use("/auth", authRoutes);
