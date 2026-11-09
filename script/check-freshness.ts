import { readFile } from "node:fs/promises";
import type { EtfData } from "../shared/schema";
import { freshnessReport } from "../server/holdings/freshness";

const data: Record<string, EtfData> = JSON.parse(await readFile(new URL("../data/holdings.json", import.meta.url), "utf8"));
const { problems, warnings } = freshnessReport(data);
console.log(`${Object.keys(data).length} portfolios checked, ${problems.length} problem(s), ${warnings.length} warning(s)`);
for (const warning of warnings) console.warn(warning);
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
