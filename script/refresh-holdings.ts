import { readFile, writeFile, rename } from "node:fs/promises";
import type { EtfData } from "../shared/schema";
import { fetchIssuerPortfolio, supportedTickers } from "../server/holdings/issuers";
import { secTickers } from "../server/holdings/sec";

const target = new URL("../data/holdings.json", import.meta.url);
const previous: Record<string, EtfData> = JSON.parse(await readFile(target, "utf8"));
const tickers = process.argv.slice(2).length ? process.argv.slice(2) : [...supportedTickers, ...secTickers];
const queue = [...tickers];
let failures = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const ticker = queue.shift()!;
    try {
      const data = await fetchIssuerPortfolio(ticker, previous[ticker]?.sourceAsOf);
      if (previous[ticker]?.sourceAsOf && data.sourceAsOf! < previous[ticker].sourceAsOf!) {
        // Some issuer mirrors serve an older copy for a while. The stored portfolio is still the newest complete one, so keep it; check-freshness fails if it really gets too old.
        const { sourceError, lastAttemptAt, ...healthy } = previous[ticker];
        previous[ticker] = { ...healthy, isFallback: false };
        console.log(`${ticker}: source still shows ${data.sourceAsOf}, keeping newer stored ${healthy.sourceAsOf}`);
        continue;
      }
      previous[ticker] = data;
      console.log(`${ticker}: ${data.sourceAsOf}, ${data.holdingsCount} positions, ${data.coverageWeight?.toFixed(2)}% net weight`);
    } catch (error: any) {
      // SEC-only tickers are optional extras: report them without failing the whole refresh.
      if (!secTickers.includes(ticker)) failures++;
      if (previous[ticker]) previous[ticker] = { ...previous[ticker], sourceError: error.message, isFallback: true, lastAttemptAt: new Date().toISOString() };
      console.error(`${secTickers.includes(ticker) ? "WARNING " : ""}${ticker}: ${error.message}; ${previous[ticker] ? "last healthy portfolio retained" : "no healthy portfolio available"}`);
    }
  }
}));
const temporary = new URL("../data/holdings.json.tmp", import.meta.url);
await writeFile(temporary, JSON.stringify(previous, null, 2) + "\n");
await rename(temporary, target);
if (failures) process.exitCode = 1;
