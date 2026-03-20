/**
 * Vercel Serverless Function entry point.
 *
 * Bundled by esbuild into api/index.cjs (CJS format) during `npm run vercel-build`.
 * Uses CJS because express/axios use CommonJS require() internally.
 * All @shared/* aliases resolved at build time.
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

// Register routes (async but resolves synchronously — no awaits at top level)
registerRoutes(httpServer, app).catch((err) => {
  console.error("Failed to register routes:", err);
});

// Error handler
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Serverless function error:", err);
  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
});

// Export for Vercel serverless — esbuild bundles this as CJS
export default app;
