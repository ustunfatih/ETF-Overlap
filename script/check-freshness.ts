import { readFile } from "node:fs/promises";
import type { EtfData } from "../shared/schema";

// Maximum acceptable age (days) of a portfolio's report date.
const limits: Record<string, number> = { "SEC Form N-PORT": 130 }; // quarterly filings, published up to 60 days late
const defaultLimit = Number(process.env.MAX_PORTFOLIO_AGE_DAYS) || 60; // 1-2 month old reports are normal
const data: Record<string, EtfData> = JSON.parse(await readFile(new URL("../data/holdings.json", import.meta.url), "utf8"));
const now = Date.now();
const problems: string[] = [];
for (const [ticker, portfolio] of Object.entries(data)) {
  const age = Math.floor((now - Date.parse(`${portfolio.sourceAsOf}T00:00:00Z`)) / 86_400_000);
  const limit = limits[portfolio.sourceName || ""] ?? defaultLimit;
  if (!Number.isFinite(age)) problems.push(`${ticker}: portfolio date missing`);
  else if (age > limit) problems.push(`${ticker}: ${portfolio.sourceAsOf} is ${age} days old (limit ${limit}, ${portfolio.sourceName})`);
  if (portfolio.sourceError) problems.push(`${ticker}: last refresh failed: ${portfolio.sourceError}`);
}
console.log(`${Object.keys(data).length} portfolios checked, ${problems.length} problem(s)`);
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
