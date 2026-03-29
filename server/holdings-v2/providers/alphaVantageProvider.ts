import axios from "axios";
import type { HoldingRow } from "@shared/schema";
import type { HoldingsProvider, HoldingsProviderResult } from "../types";

type AlphaHoldingCandidate = {
  symbol?: string;
  ticker?: string;
  name?: string;
  companyName?: string;
  weight?: string | number;
  allocation?: string | number;
  percentage?: string | number;
};

const toWeight = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim().replace("%", "");
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseHoldings = (raw: unknown): HoldingRow[] => {
  if (!Array.isArray(raw)) return [];

  const rows: HoldingRow[] = [];
  for (const item of raw) {
    const h = item as AlphaHoldingCandidate;
    const ticker = (h.symbol || h.ticker || "").trim().toUpperCase();
    const name = (h.name || h.companyName || ticker).trim();
    const weight = toWeight(h.weight ?? h.allocation ?? h.percentage);

    if (!ticker || !name) continue;
    rows.push({ ticker, name, weight });
  }

  // Deduplicate by ticker while keeping the largest known weight.
  const deduped = new Map<string, HoldingRow>();
  for (const row of rows) {
    const existing = deduped.get(row.ticker);
    if (!existing || row.weight > existing.weight) {
      deduped.set(row.ticker, row);
    }
  }

  return Array.from(deduped.values());
};

export class AlphaVantageProvider implements HoldingsProvider {
  name = "alpha_vantage";

  constructor(private readonly apiKey: string) {}

  async fetch(ticker: string): Promise<HoldingsProviderResult | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.get("https://www.alphavantage.co/query", {
        params: {
          function: "ETF_PROFILE",
          symbol: ticker,
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      const payload = response.data as Record<string, unknown>;
      const holdingsRaw =
        payload.holdings ||
        payload.constituents ||
        payload.top_holdings ||
        payload.topHoldings ||
        [];

      const holdings = parseHoldings(holdingsRaw);
      if (holdings.length === 0) {
        return null;
      }

      const sourceAsOf =
        (typeof payload.asOfDate === "string" && payload.asOfDate) ||
        (typeof payload.latestUpdate === "string" && payload.latestUpdate) ||
        undefined;

      return {
        holdings,
        metadata: {
          source: "alpha_vantage",
          sourceAsOf,
          isFallback: false,
          holdingsCount: holdings.length,
          coverageNote: "Provider returned ETF holdings payload.",
        },
      };
    } catch {
      return null;
    }
  }
}
