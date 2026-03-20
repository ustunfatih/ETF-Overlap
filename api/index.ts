/**
 * Vercel Serverless Function entry point.
 *
 * Exports the Express app as the default export so Vercel
 * can run it as a serverless function. All API routes are
 * registered here. The Vite frontend is served as static
 * files from the `public/` directory (Vercel CDN).
 *
 * Local dev uses server/index.ts (full HTTP server with Vite HMR).
 */

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

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

// Register all API routes (async — resolved at module load)
await registerRoutes(httpServer, app);

// Error handler
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Server Error:", err);
  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
});

// Default export for Vercel serverless
export default app;
