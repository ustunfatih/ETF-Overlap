import type { HoldingRow } from "@shared/schema";

export type HoldingsSource = "alpha_vantage" | "legacy_live" | "legacy_fallback" | "manual";

export type HoldingsMetadata = {
  source: HoldingsSource;
  sourceAsOf?: string;
  isFallback: boolean;
  holdingsCount: number;
  coverageNote?: string;
};

export type HoldingsProviderResult = {
  holdings: HoldingRow[];
  metadata: HoldingsMetadata;
};

export interface HoldingsProvider {
  name: string;
  fetch(ticker: string): Promise<HoldingsProviderResult | null>;
}
