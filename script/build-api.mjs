/**
 * Bundles api/index.ts into api/index.mjs for Vercel deployment.
 * - Resolves @shared/* path alias to ./shared/*
 * - Bundles all local code; keeps npm deps as externals
 * - Outputs ESM so Vercel can import it as a serverless function
 */
import { build } from "esbuild";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"));
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// Bundle everything except npm packages
const externals = allDeps;

await build({
  entryPoints: [path.join(root, "api/index.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: path.join(root, "api/index.mjs"),
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  alias: {
    "@shared": path.join(root, "shared"),
  },
  external: externals,
  logLevel: "info",
});

console.log("api/index.mjs built successfully");
