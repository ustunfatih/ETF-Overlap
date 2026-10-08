import type { Express } from "express";
import type { Server } from "http";
import { storage, weeklyRefreshBoundary } from "./storage";
import {
  computeOverlapMatrix,
  buildTreemapData,
  buildNetworkData,
  buildUpSetData,
} from "./overlapEngine";
import type { EtfData, HoldingRow } from "@shared/schema";
import { config } from "./config";
import { fetchIssuerPortfolio, issuerStatus } from "./holdings/issuers";
import { validatePortfolio } from "./holdings/parsers";

const normalizeTicker = (ticker: string) => ticker.toUpperCase().trim();

async function loadEtfData(upper: string): Promise<EtfData> {
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(upper)) throw new Error("Invalid ETF ticker");
  const cached = storage.getCachedHoldings(upper);
  if (cached) return cached;
  const previous = storage.getLastHealthy(upper);
  if (previous && Date.parse(previous.lastAttemptAt || previous.fetchedAt) >= weeklyRefreshBoundary()) {
    storage.setCachedHoldings(upper, previous);
    return previous;
  }
  try {
    const fresh = await fetchIssuerPortfolio(upper, previous?.sourceAsOf);
    if (previous?.sourceAsOf && fresh.sourceAsOf! < previous.sourceAsOf) {
      // The issuer mirror is behind what we already hold; the stored portfolio is still the newest complete one.
      const { sourceError, lastAttemptAt, ...healthy } = previous;
      storage.setCachedHoldings(upper, { ...healthy, isFallback: false });
      return { ...healthy, isFallback: false };
    }
    storage.setCachedHoldings(upper, fresh);
    return fresh;
  } catch (error: any) {
    if (!previous) throw error;
    const fallback = { ...previous, isFallback: true, sourceError: error.message, lastAttemptAt: new Date().toISOString() };
    storage.setCachedHoldings(upper, fallback);
    return fallback;
  }
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

      return res.json({ success: true, data: etfData, fromCache: false });
    } catch (err: any) {
      return res.status(404).json({ success: false, error: err.message });
    }
  });

  // POST /api/etf/holdings/bulk
  // Body: { tickers: string[] }
  app.post("/api/etf/holdings/bulk", async (req, res) => {
    const { tickers } = req.body as { tickers: string[] };

    if (!Array.isArray(tickers) || tickers.length === 0 || tickers.some(ticker => typeof ticker !== "string")) {
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
    if (tickers.length > 10 || tickers.some(ticker => typeof ticker !== "string")) {
      return res.status(400).json({ success: false, error: "Provide 2–10 valid ETF tickers" });
    }

    const etfHoldingsMap = new Map<string, HoldingRow[]>();
    const portfolios: Record<string, EtfData> = {};
    const errors: string[] = [];

    await Promise.all(
      tickers.map(async (ticker) => {
        const upper = normalizeTicker(ticker);
        try {
          const cached = storage.getCachedHoldings(upper);
          if (cached) {
            etfHoldingsMap.set(upper, cached.holdings);
            portfolios[upper] = cached;
            return;
          }

          const etfData = await loadEtfData(upper);
          portfolios[upper] = etfData;
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
      matrix: { ...matrix, cells: matrix.cells.map(row => row.map(cell => ({ ...cell, sharedHoldings: cell.sharedHoldings.slice(0, 100) }))) },
      treemap,
      network,
      upset,
      errors: errors.length > 0 ? errors : undefined,
      portfolios: Object.fromEntries(Object.entries(portfolios).map(([ticker, data]) => {
        const { holdings, ...metadata } = data;
        return [ticker, metadata];
      })),
    });
  });

  // GET /api/etf/status — report date and source of every stored portfolio
  app.get("/api/etf/status", (_req, res) => {
    return res.json({ success: true, snapshots: storage.listSnapshots() });
  });

  // GET /api/admin/holdings/v2/status
  app.get("/api/admin/holdings/v2/status", (_req, res) => {
    return res.json({ success: true, status: issuerStatus() });
  });

  // POST /api/etf/holdings/upload
  // Body: { ticker: string, holdings: HoldingRow[] } — manual upload override
  app.post("/api/etf/holdings/upload", async (req, res) => {
    if (!isAdminRequest(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { ticker, holdings, sourceAsOf } = req.body as { ticker: string; holdings: HoldingRow[]; sourceAsOf: string };
    if (!ticker || !Array.isArray(holdings)) {
      return res.status(400).json({ success: false, error: "ticker and holdings required" });
    }

    const invalidHolding = holdings.find((h) =>
      !h || typeof h.ticker !== "string" || typeof h.name !== "string" || typeof h.weight !== "number" || !Number.isFinite(h.weight) || Math.abs(h.weight) > 100
    );

    if (invalidHolding) {
      return res.status(400).json({ success: false, error: "Invalid holdings payload: each row must include ticker, name, and a finite weight (-100..100)" });
    }

    const upper = normalizeTicker(ticker);
    const etfData: EtfData = {
      etf: upper,
      holdings,
      fetchedAt: new Date().toISOString(),
      source: "manual",
      sourceAsOf,
      sourceName: "Manual upload",
      isFallback: false,
      holdingsCount: holdings.length,
      coverageNote: "Manual admin upload",
    };
    try {
      if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(upper)) throw new Error("Invalid ETF ticker");
      storage.setCachedHoldings(upper, validatePortfolio(etfData));
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.json({ success: true, message: `Holdings saved for ${upper}` });
  });

  // DELETE /api/etf/cache
  app.delete("/api/etf/cache", (_req, res) => {
    storage.clearCache();
    return res.json({ success: true, message: "Cache cleared" });
  });
}
