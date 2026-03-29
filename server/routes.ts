import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { fetchEtfHoldings } from "./etfFetcher";
import {
  computeOverlapMatrix,
  buildTreemapData,
  buildNetworkData,
  buildUpSetData,
} from "./overlapEngine";
import type { EtfData, HoldingRow } from "@shared/schema";
import { config } from "./config";
import { fetchEtfDataV2, getV2ProviderStatus } from "./holdings-v2/orchestrator";

const normalizeTicker = (ticker: string) => ticker.toUpperCase().trim();

async function loadEtfData(upper: string): Promise<EtfData> {
  if (config.holdingsV2Enabled) {
    return fetchEtfDataV2(upper);
  }

  const holdings = await fetchEtfHoldings(upper);
  return {
    etf: upper,
    holdings,
    fetchedAt: new Date().toISOString(),
  };
}

function isAdminRequest(req: any): boolean {
  if (!config.adminAuthEnabled) return true;
  if (!config.adminApiKey) return false;
  const token = req.header("x-admin-api-key") || "";
  return token === config.adminApiKey;
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // GET /api/etf/:ticker/holdings
  app.get("/api/etf/:ticker/holdings", async (req, res) => {
    const { ticker } = req.params;
    const upper = normalizeTicker(ticker);

    try {
      // Check cache
      const cached = storage.getCachedHoldings(upper);
      if (cached) {
        return res.json({ success: true, data: cached, fromCache: true });
      }

      const etfData = await loadEtfData(upper);
      storage.setCachedHoldings(upper, etfData);

      return res.json({ success: true, data: etfData, fromCache: false });
    } catch (err: any) {
      return res.status(404).json({ success: false, error: err.message });
    }
  });

  // POST /api/etf/holdings/bulk
  // Body: { tickers: string[] }
  app.post("/api/etf/holdings/bulk", async (req, res) => {
    const { tickers } = req.body as { tickers: string[] };

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ success: false, error: "tickers array required" });
    }
    if (tickers.length > 10) {
      return res.status(400).json({ success: false, error: "Max 10 ETFs allowed" });
    }

    const results: Record<string, { data: EtfData | null; error?: string }> = {};

    await Promise.all(
      tickers.map(async (ticker) => {
        const upper = normalizeTicker(ticker);
        try {
          const cached = storage.getCachedHoldings(upper);
          if (cached) {
            results[upper] = { data: cached };
            return;
          }
          const etfData = await loadEtfData(upper);
          storage.setCachedHoldings(upper, etfData);
          results[upper] = { data: etfData };
        } catch (err: any) {
          results[upper] = { data: null, error: err.message };
        }
      })
    );

    return res.json({ success: true, results });
  });

  // POST /api/etf/overlap
  // Body: { tickers: string[] }
  app.post("/api/etf/overlap", async (req, res) => {
    const { tickers } = req.body as { tickers: string[] };

    if (!Array.isArray(tickers) || tickers.length < 2) {
      return res.status(400).json({ success: false, error: "At least 2 tickers required" });
    }

    const etfHoldingsMap = new Map<string, HoldingRow[]>();
    const errors: string[] = [];

    await Promise.all(
      tickers.map(async (ticker) => {
        const upper = normalizeTicker(ticker);
        try {
          const cached = storage.getCachedHoldings(upper);
          if (cached) {
            etfHoldingsMap.set(upper, cached.holdings);
            return;
          }

          const etfData = await loadEtfData(upper);
          storage.setCachedHoldings(upper, etfData);
          etfHoldingsMap.set(upper, etfData.holdings);
        } catch (err: any) {
          errors.push(`${upper}: ${err.message}`);
        }
      })
    );

    if (etfHoldingsMap.size < 2) {
      return res.status(400).json({
        success: false,
        error: `Could not fetch enough holdings. Errors: ${errors.join(", ")}`,
      });
    }

    const validTickers = Array.from(etfHoldingsMap.keys());
    const matrix = computeOverlapMatrix(etfHoldingsMap);
    const treemap = buildTreemapData(validTickers, etfHoldingsMap);
    const network = buildNetworkData(matrix, 3);
    const upset = buildUpSetData(validTickers, etfHoldingsMap);

    return res.json({
      success: true,
      matrix,
      treemap,
      network,
      upset,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  // GET /api/admin/holdings/v2/status
  app.get("/api/admin/holdings/v2/status", (_req, res) => {
    return res.json({ success: true, status: getV2ProviderStatus() });
  });

  // POST /api/etf/holdings/upload
  // Body: { ticker: string, holdings: HoldingRow[] } — manual upload override
  app.post("/api/etf/holdings/upload", async (req, res) => {
    if (!isAdminRequest(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { ticker, holdings } = req.body as { ticker: string; holdings: HoldingRow[] };
    if (!ticker || !Array.isArray(holdings)) {
      return res.status(400).json({ success: false, error: "ticker and holdings required" });
    }

    const invalidHolding = holdings.find((h) =>
      !h || typeof h.ticker !== "string" || typeof h.name !== "string" || typeof h.weight !== "number" || h.weight < 0 || h.weight > 100
    );

    if (invalidHolding) {
      return res.status(400).json({ success: false, error: "Invalid holdings payload: each row must include ticker, name, and weight (0..100)" });
    }

    const upper = normalizeTicker(ticker);
    const etfData: EtfData = {
      etf: upper,
      holdings,
      fetchedAt: new Date().toISOString(),
      source: "manual",
      isFallback: false,
      holdingsCount: holdings.length,
      coverageNote: "Manual admin upload",
    };
    storage.setCachedHoldings(upper, etfData);
    return res.json({ success: true, message: `Holdings saved for ${upper}` });
  });

  // DELETE /api/etf/cache
  app.delete("/api/etf/cache", (_req, res) => {
    storage.clearCache();
    return res.json({ success: true, message: "Cache cleared" });
  });
}
