import { Router } from "express";

// The aggregator every feature module hangs off from B5 onward:
//   apiRouter.use("/auth", authRoutes)
export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ version: "v1", status: "ok" });
});
