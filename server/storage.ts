import type { EtfData, HoldingRow } from "@shared/schema";
import { config } from "./config";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import snapshots from "../data/holdings.json";

// Weekly cache, invalidated at the Sunday 17:30 UTC refresh boundary.
const cache = new Map<string, { data: EtfData; ts: number }>();
const TTL_MS = config.holdingsTtlHours * 60 * 60 * 1000;
const cacheDirectory = process.env.VERCEL ? "/tmp/etf-overlap-holdings" : join(process.cwd(), ".cache", "holdings");
const lastHealthy = new Map<string, EtfData>();

export function weeklyRefreshBoundary(now = new Date()): number {
  const boundary = new Date(now);
  boundary.setUTCDate(boundary.getUTCDate() - boundary.getUTCDay());
  boundary.setUTCHours(17, 30, 0, 0);
  if (boundary.getTime() > now.getTime()) boundary.setUTCDate(boundary.getUTCDate() - 7);
  return boundary.getTime();
}

export interface IStorage {
  getCachedHoldings(ticker: string): EtfData | null;
  setCachedHoldings(ticker: string, data: EtfData): void;
  clearCache(): void;
  getLastHealthy(ticker: string): EtfData | null;
}

export class MemStorage implements IStorage {
  getCachedHoldings(ticker: string): EtfData | null {
    const entry = cache.get(ticker.toUpperCase());
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS || entry.ts < weeklyRefreshBoundary()) {
      return null;
    }
    return entry.data;
  }

  setCachedHoldings(ticker: string, data: EtfData): void {
    cache.set(ticker.toUpperCase(), { data, ts: Date.now() });
    if (data.complete && data.sourceAsOf && !data.sourceError) {
      lastHealthy.set(ticker.toUpperCase(), data);
      try {
        mkdirSync(cacheDirectory, { recursive: true });
        const target = join(cacheDirectory, `${ticker.toUpperCase()}.json`);
        const temporary = `${target}.${process.pid}.tmp`;
        writeFileSync(temporary, JSON.stringify(data));
        renameSync(temporary, target);
      } catch (error) {
        console.error("Could not persist holdings cache:", error);
      }
    }
  }

  getLastHealthy(ticker: string): EtfData | null {
    const upper = ticker.toUpperCase();
    const candidates: EtfData[] = [];
    const memory = lastHealthy.get(upper);
    if (memory) candidates.push(memory);
    const snapshot = (snapshots as Record<string, EtfData>)[upper];
    if (snapshot) candidates.push(snapshot);
    try {
      candidates.push(JSON.parse(readFileSync(join(cacheDirectory, `${upper}.json`), "utf8")));
    } catch (error: any) {
      if (error.code !== "ENOENT") console.error("Could not read holdings cache:", error);
    }
    return candidates.filter(data => data.complete && data.sourceAsOf && data.holdings?.length)
      .sort((a, b) => (b.sourceAsOf || "").localeCompare(a.sourceAsOf || "") || b.fetchedAt.localeCompare(a.fetchedAt))[0] || null;
  }

  clearCache(): void {
    cache.clear();
  }
}

export const storage = new MemStorage();
