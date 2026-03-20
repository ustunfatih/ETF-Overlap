/**
 * ETF Overlap Computation Engine
 * 
 * Computes:
 * 1. Raw overlap count (shared holdings regardless of weight)
 * 2. Weighted overlap score (cosine similarity of weight vectors)
 */

import type { HoldingRow, OverlapCell, OverlapMatrix, TreemapNode, NetworkNode, NetworkEdge } from "@shared/schema";

function buildWeightMap(holdings: HoldingRow[]): Map<string, { weight: number; name: string }> {
  const map = new Map<string, { weight: number; name: string }>();
  for (const h of holdings) {
    const key = h.ticker.toUpperCase();
    // Merge duplicates (some ETFs list same stock multiple share classes)
    const existing = map.get(key);
    if (existing) {
      existing.weight += h.weight;
    } else {
      map.set(key, { weight: h.weight, name: h.name });
    }
  }
  return map;
}

/**
 * Weighted overlap score: sum of min(wA, wB) for shared holdings
 * Normalized to [0, 100] where 100 = identical portfolios
 */
function computeWeightedScore(
  mapA: Map<string, { weight: number; name: string }>,
  mapB: Map<string, { weight: number; name: string }>
): number {
  let overlap = 0;
  for (const [ticker, a] of mapA) {
    const b = mapB.get(ticker);
    if (b) {
      overlap += Math.min(a.weight, b.weight);
    }
  }
  // Normalize: divide by average total weight (should be ~100 each)
  const totalA = Array.from(mapA.values()).reduce((s, v) => s + v.weight, 0);
  const totalB = Array.from(mapB.values()).reduce((s, v) => s + v.weight, 0);
  const avg = (totalA + totalB) / 2;
  if (avg === 0) return 0;
  return Math.min(100, (overlap / avg) * 100);
}

export function computeOverlapMatrix(
  etfHoldingsMap: Map<string, HoldingRow[]>
): OverlapMatrix {
  const etfs = Array.from(etfHoldingsMap.keys());
  const weightMaps = new Map<string, Map<string, { weight: number; name: string }>>();

  for (const [etf, holdings] of etfHoldingsMap) {
    weightMaps.set(etf, buildWeightMap(holdings));
  }

  const cells: OverlapCell[][] = etfs.map((etfA) =>
    etfs.map((etfB) => {
      if (etfA === etfB) {
        const map = weightMaps.get(etfA)!;
        return {
          etfA,
          etfB,
          sharedCount: map.size,
          weightedScore: 100,
          sharedHoldings: Array.from(map.entries()).map(([ticker, v]) => ({
            ticker,
            name: v.name,
            weightA: v.weight,
            weightB: v.weight,
          })),
        };
      }

      const mapA = weightMaps.get(etfA)!;
      const mapB = weightMaps.get(etfB)!;

      const shared: OverlapCell["sharedHoldings"] = [];
      for (const [ticker, a] of mapA) {
        const b = mapB.get(ticker);
        if (b) {
          shared.push({ ticker, name: a.name, weightA: a.weight, weightB: b.weight });
        }
      }
      shared.sort((a, b) => (b.weightA + b.weightB) / 2 - (a.weightA + a.weightB) / 2);

      return {
        etfA,
        etfB,
        sharedCount: shared.length,
        weightedScore: parseFloat(computeWeightedScore(mapA, mapB).toFixed(1)),
        sharedHoldings: shared,
      };
    })
  );

  return { etfs, cells };
}

export function buildTreemapData(
  selectedEtfs: string[],
  etfHoldingsMap: Map<string, HoldingRow[]>
): TreemapNode[] {
  // Aggregate all unique holdings across selected ETFs
  const holdingEtfs = new Map<string, { name: string; totalWeight: number; etfs: string[]; weightByEtf: Record<string, number> }>();

  for (const etf of selectedEtfs) {
    const holdings = etfHoldingsMap.get(etf) || [];
    for (const h of holdings) {
      const key = h.ticker.toUpperCase();
      const existing = holdingEtfs.get(key);
      if (existing) {
        existing.totalWeight += h.weight;
        existing.etfs.push(etf);
        existing.weightByEtf[etf] = h.weight;
      } else {
        holdingEtfs.set(key, {
          name: h.name,
          totalWeight: h.weight,
          etfs: [etf],
          weightByEtf: { [etf]: h.weight },
        });
      }
    }
  }

  // Sort by total weight and take top 60
  const nodes: TreemapNode[] = Array.from(holdingEtfs.entries())
    .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
    .slice(0, 60)
    .map(([ticker, data]) => ({
      ticker,
      name: data.name,
      value: parseFloat((data.totalWeight / selectedEtfs.length).toFixed(2)),
      etfs: data.etfs,
      isShared: data.etfs.length > 1,
      weightByEtf: data.weightByEtf,
    }));

  return nodes;
}

export function buildNetworkData(
  matrix: OverlapMatrix,
  minScore: number = 5
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  const nodes: NetworkNode[] = matrix.etfs.map((etf) => ({
    id: etf,
    label: etf,
  }));

  const edges: NetworkEdge[] = [];
  for (let i = 0; i < matrix.etfs.length; i++) {
    for (let j = i + 1; j < matrix.etfs.length; j++) {
      const cell = matrix.cells[i][j];
      if (cell.weightedScore >= minScore) {
        edges.push({
          source: matrix.etfs[i],
          target: matrix.etfs[j],
          weight: cell.weightedScore,
          sharedCount: cell.sharedCount,
        });
      }
    }
  }

  return { nodes, edges };
}

export function buildUpSetData(
  selectedEtfs: string[],
  etfHoldingsMap: Map<string, HoldingRow[]>
): {
  sets: string[];
  intersections: { set: string[]; size: number; holdings: string[] }[];
} {
  const weightMaps = new Map<string, Set<string>>();
  for (const etf of selectedEtfs) {
    const tickers = new Set<string>();
    for (const h of (etfHoldingsMap.get(etf) || [])) {
      tickers.add(h.ticker.toUpperCase());
    }
    weightMaps.set(etf, tickers);
  }

  // Generate all intersections (power set)
  const intersections: { set: string[]; size: number; holdings: string[] }[] = [];
  const n = selectedEtfs.length;

  for (let mask = 1; mask < (1 << n); mask++) {
    const subset = selectedEtfs.filter((_, i) => (mask >> i) & 1);
    if (subset.length === 0) continue;

    // Find holdings that are in ALL etfs in subset but NOT in others
    const inSubset = new Set<string>(weightMaps.get(subset[0]) || []);
    for (let i = 1; i < subset.length; i++) {
      const s = weightMaps.get(subset[i])!;
      for (const t of inSubset) {
        if (!s.has(t)) inSubset.delete(t);
      }
    }

    // Exclude from others
    const notInSubset = selectedEtfs.filter((e) => !subset.includes(e));
    const exclusive = new Set<string>(inSubset);
    for (const other of notInSubset) {
      const s = weightMaps.get(other)!;
      for (const t of exclusive) {
        if (s.has(t)) exclusive.delete(t);
      }
    }

    if (exclusive.size > 0) {
      intersections.push({
        set: subset,
        size: exclusive.size,
        holdings: Array.from(exclusive).slice(0, 10),
      });
    }
  }

  intersections.sort((a, b) => b.size - a.size);

  return { sets: selectedEtfs, intersections: intersections.slice(0, 20) };
}
