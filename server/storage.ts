import type { EtfData, HoldingRow } from "@shared/schema";
import { config } from "./config";

// In-memory cache: ticker -> EtfData (with TTL of 1 hour)
const cache = new Map<string, { data: EtfData; ts: number }>();
const TTL_MS = config.holdingsTtlHours * 60 * 60 * 1000;

export interface IStorage {
  getCachedHoldings(ticker: string): EtfData | null;
  setCachedHoldings(ticker: string, data: EtfData): void;
  clearCache(): void;
}

export class MemStorage implements IStorage {
  getCachedHoldings(ticker: string): EtfData | null {
    const entry = cache.get(ticker.toUpperCase());
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) {
      cache.delete(ticker.toUpperCase());
      return null;
    }
    return entry.data;
  }

  setCachedHoldings(ticker: string, data: EtfData): void {
    cache.set(ticker.toUpperCase(), { data, ts: Date.now() });
  }

  clearCache(): void {
    cache.clear();
  }
}

export const storage = new MemStorage();
