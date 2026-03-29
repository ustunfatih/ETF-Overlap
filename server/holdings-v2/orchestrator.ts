import type { EtfData } from "@shared/schema";
import { fetchEtfHoldings } from "../etfFetcher";
import { config } from "../config";
import type { HoldingsProvider } from "./types";
import { AlphaVantageProvider } from "./providers/alphaVantageProvider";

const providers: HoldingsProvider[] = [];
if (config.providerAlphaEnabled) {
  providers.push(new AlphaVantageProvider(config.alphaVantageApiKey));
}

const isLikelyFallbackTicker = (ticker: string): boolean => {
  // Best-effort signal for legacy path since legacy fetcher does not expose provenance.
  const knownFallbacks = new Set([
    "SPY", "QQQ", "VOO", "SCHD", "SCHG", "VTI", "FDVV", "SPYI", "QQQI", "VYMI", "AIS",
  ]);
  return knownFallbacks.has(ticker.toUpperCase());
};

export async function fetchEtfDataV2(ticker: string): Promise<EtfData> {
  const upper = ticker.toUpperCase();

  for (const provider of providers) {
    const result = await provider.fetch(upper);
    if (!result) continue;

    return {
      etf: upper,
      holdings: result.holdings,
      fetchedAt: new Date().toISOString(),
      source: result.metadata.source,
      sourceAsOf: result.metadata.sourceAsOf,
      isFallback: result.metadata.isFallback,
      holdingsCount: result.metadata.holdingsCount,
      coverageNote: result.metadata.coverageNote,
    };
  }

  const holdings = await fetchEtfHoldings(upper);
  const legacyFallback = isLikelyFallbackTicker(upper);

  return {
    etf: upper,
    holdings,
    fetchedAt: new Date().toISOString(),
    source: legacyFallback ? "legacy_fallback" : "legacy_live",
    isFallback: legacyFallback,
    holdingsCount: holdings.length,
    coverageNote: legacyFallback
      ? "Legacy curated fallback holdings were used."
      : "Legacy live holdings source was used.",
  };
}

export function getV2ProviderStatus() {
  return {
    v2Enabled: config.holdingsV2Enabled,
    providers: {
      alphaVantage: {
        enabled: config.providerAlphaEnabled,
        configured: Boolean(config.alphaVantageApiKey),
      },
      issuer: {
        enabled: config.providerIssuerEnabled,
        configured: false,
      },
      sec: {
        enabled: config.providerSecEnabled,
        configured: false,
      },
    },
  };
}
