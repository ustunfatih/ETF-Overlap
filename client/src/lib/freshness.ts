import type { EtfData } from "@shared/schema";

const DAY_MS = 86_400_000;
export const STALE_DAYS = 60; // Monthly publishers (e.g. Vanguard) are normally 1-2 months behind.
export const SEC_STALE_DAYS = 120; // Quarterly SEC filings, published up to 60 days late.

export const ageDays = (date?: string) => date ? Math.max(0, Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / DAY_MS)) : null;
export const ageLabel = (age: number | null) => age === null ? "unknown age" : age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} old`;
export const isStale = (report: Pick<EtfData, "sourceAsOf" | "source">) => {
  const age = ageDays(report.sourceAsOf);
  return age === null || age > (report.source === "sec" ? SEC_STALE_DAYS : STALE_DAYS);
};
