/**
 * Bundles api/index.ts into api/index.cjs for Vercel deployment.
 * - CJS format (not ESM) because express/axios use CommonJS require() internally
 * - Resolves @shared/* path alias
 * - Bundles ALL dependencies (fully self-contained)
 * - Wraps with module.exports for Vercel serverless detection
 */
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

await build({
  entryPoints: [path.join(root, "server/vercel-entry.ts")],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: path.join(root, "api/index.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  alias: {
    "@shared": path.join(root, "shared"),
  },
  // Bundle all npm deps too — fully self-contained
  external: [],
  logLevel: "info",
});

console.log("api/index.js built successfully");
