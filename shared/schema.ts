import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ETF Holdings cache table
export const etfHoldings = pgTable("etf_holdings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticker: text("ticker").notNull(),
  holdingTicker: text("holding_ticker").notNull(),
  holdingName: text("holding_name").notNull(),
  weight: real("weight").notNull(), // percentage 0-100
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const insertEtfHoldingSchema = createInsertSchema(etfHoldings).omit({ id: true, fetchedAt: true });
export type InsertEtfHolding = z.infer<typeof insertEtfHoldingSchema>;
export type EtfHolding = typeof etfHoldings.$inferSelect;

// Types for the overlap computation (not stored in DB, computed in memory)
export type HoldingRow = {
  ticker: string;
  name: string;
  weight: number;
};

export type EtfData = {
  etf: string;
  holdings: HoldingRow[];
  fetchedAt: string;
};

export type OverlapCell = {
  etfA: string;
  etfB: string;
  sharedCount: number;
  weightedScore: number; // 0-100 cosine-style similarity
  sharedHoldings: {
    ticker: string;
    name: string;
    weightA: number;
    weightB: number;
  }[];
};

export type OverlapMatrix = {
  etfs: string[];
  cells: OverlapCell[][];
};

export type TreemapNode = {
  name: string;
  ticker: string;
  value: number;          // averaged weight across all ETFs (for combined view)
  etfs: string[];
  isShared: boolean;
  weightByEtf: Record<string, number>; // per-ETF weight for single-ETF filter view
};

export type NetworkNode = {
  id: string;
  label: string;
};

export type NetworkEdge = {
  source: string;
  target: string;
  weight: number;
  sharedCount: number;
};
