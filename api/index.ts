/**
 * Vercel Serverless Function entry point.
 *
 * Bundled by esbuild (script/build-api.mjs) during `npm run vercel-build`.
 * All @shared/* aliases are resolved at build time.
 * Outputs to api/index.mjs — Vercel runs this as a serverless function.
 *
 * NOTE: No top-level await — Vercel's Node.js runtime may not support it
 * in all configurations. Routes are registered synchronously via .then().
 *
 * Local dev uses server/index.ts (full HTTP server with Vite HMR).
 */

import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

app.use(
  express.json({
    verify: (req: any, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Register routes — registerRoutes is async but resolves synchronously
// (all awaits are inside route handlers, not at registration)
// Using .then() to avoid top-level await which may crash Vercel runtime
registerRoutes(httpServer, app).catch((err) => {
  console.error("Failed to register routes:", err);
});

// Error handler (must be last)
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Serverless function error:", err);
  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
});

export default app;
