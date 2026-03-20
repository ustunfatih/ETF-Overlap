import { useState, useRef, useEffect } from "react";
import type { TreemapNode } from "@shared/schema";

type Props = {
  nodes: TreemapNode[];
  etfs: string[];
};

type TreemapRect = TreemapNode & { x: number; y: number; w: number; h: number; displayValue: number };

// Squarified treemap algorithm
function squarify(
  items: { node: TreemapNode; val: number }[],
  x: number, y: number, w: number, h: number
): TreemapRect[] {
  if (items.length === 0) return [];
  const total = items.reduce((s, n) => s + n.val, 0);
  if (total === 0) return [];
  const area = w * h;
  const scaled = items.map((n) => ({ ...n, scaledVal: (n.val / total) * area }));
  const rects: TreemapRect[] = [];
  layoutRecursive(scaled, x, y, w, h, rects);
  return rects;
}

function worstRatio(row: { scaledVal: number }[], length: number): number {
  const rowSum = row.reduce((s, n) => s + n.scaledVal, 0);
  let worst = 0;
  for (const item of row) {
    const itemLen = (item.scaledVal / rowSum) * length;
    const shorter = rowSum / length;
    const r = itemLen > shorter ? itemLen / shorter : shorter / itemLen;
    if (r > worst) worst = r;
  }
  return worst;
}

function layoutRecursive(
  items: ({ node: TreemapNode; val: number; scaledVal: number })[],
  x: number, y: number, w: number, h: number,
  rects: TreemapRect[]
): void {
  if (items.length === 0) return;
  if (items.length === 1) {
    rects.push({ ...items[0].node, x, y, w, h, displayValue: items[0].val });
    return;
  }
  const isWide = w >= h;
  const length = isWide ? h : w;
  let row: typeof items = [];
  let i = 0;
  while (i < items.length) {
    const next = items[i];
    const newRow = [...row, next];
    if (row.length === 0 || worstRatio(newRow, length) <= worstRatio(row, length)) {
      row = newRow;
      i++;
    } else {
      break;
    }
  }
  const rowSum = row.reduce((s, n) => s + n.scaledVal, 0);
  const rowFrac = rowSum / (w * h);
  const rowThick = isWide ? rowFrac * w : rowFrac * h;
  let pos = isWide ? y : x;
  for (const item of row) {
    const itemLen = (item.scaledVal / rowSum) * length;
    if (isWide) {
      rects.push({ ...item.node, x, y: pos, w: rowThick, h: itemLen, displayValue: item.val });
    } else {
      rects.push({ ...item.node, x: pos, y, w: itemLen, h: rowThick, displayValue: item.val });
    }
    pos += itemLen;
  }
  const remaining = items.slice(row.length);
  if (isWide) {
    layoutRecursive(remaining, x + rowThick, y, w - rowThick, h, rects);
  } else {
    layoutRecursive(remaining, x, y + rowThick, w, h - rowThick, rects);
  }
}

const ETF_COLORS = [
  "hsl(210 80% 56%)", "hsl(160 60% 45%)", "hsl(45 90% 55%)", "hsl(280 65% 60%)",
  "hsl(15 80% 55%)", "hsl(190 70% 50%)", "hsl(320 60% 55%)", "hsl(100 55% 48%)",
  "hsl(35 85% 55%)", "hsl(250 65% 62%)",
];

export default function TreemapView({ nodes, etfs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [tooltip, setTooltip] = useState<{ node: TreemapRect; x: number; y: number } | null>(null);
  const [selectedEtf, setSelectedEtf] = useState<string | null>(null); // null = All
  const [showSharedOnly, setShowSharedOnly] = useState(false);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(400, height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // When ETF is selected, show only that ETF's holdings with its actual weight
  const displayItems: { node: TreemapNode; val: number }[] = (() => {
    if (selectedEtf) {
      // Single ETF view: filter to holdings that belong to this ETF, use their actual weight
      return nodes
        .filter((n) => n.etfs.includes(selectedEtf))
        .filter((n) => !showSharedOnly || n.isShared)
        .map((n) => ({ node: n, val: n.weightByEtf[selectedEtf] ?? n.value }))
        .sort((a, b) => b.val - a.val);
    } else {
      // Combined view
      return nodes
        .filter((n) => !showSharedOnly || n.isShared)
        .map((n) => ({ node: n, val: n.value }));
    }
  })();

  const rects = squarify(displayItems, 0, 0, dims.w, dims.h);

  const getColor = (node: TreemapNode) => {
    if (selectedEtf) {
      // Single-ETF view: use that ETF's color, gray out holdings also in other ETFs
      const etfIdx = etfs.indexOf(selectedEtf);
      if (node.isShared) return "hsl(210 15% 40%)";
      return ETF_COLORS[etfIdx % ETF_COLORS.length];
    }
    if (!node.isShared) {
      const etfIdx = etfs.indexOf(node.etfs[0]);
      return ETF_COLORS[etfIdx % ETF_COLORS.length];
    }
    return "hsl(210 15% 40%)";
  };

  const totalShown = displayItems.reduce((s, n) => s + n.val, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
            Holdings Treemap
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedEtf
              ? `Showing ${selectedEtf} holdings · box size = actual weight in ${selectedEtf}`
              : "Box size = average weight across ETFs · Colored = unique · Gray = shared by 2+ ETFs"}
          </p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Legend */}
          <div className="flex items-center gap-2 flex-wrap">
            {etfs.map((etf, i) => (
              <div key={etf} className="flex items-center gap-1">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: ETF_COLORS[i % ETF_COLORS.length] }}
                />
                <span className="text-xs text-muted-foreground">{etf}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: "hsl(210 15% 40%)" }} />
              <span className="text-xs text-muted-foreground">Shared</span>
            </div>
          </div>

          {/* Shared-only toggle */}
          <button
            data-testid="button-toggle-shared"
            onClick={() => setShowSharedOnly(!showSharedOnly)}
            className={`text-xs px-3 py-1 rounded-md border transition-colors ${
              showSharedOnly
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {showSharedOnly ? "Shared only" : "Show shared only"}
          </button>
        </div>
      </div>

      {/* ETF Filter Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">View:</span>
        <button
          data-testid="filter-all"
          onClick={() => setSelectedEtf(null)}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
            selectedEtf === null
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          All ETFs
        </button>
        {etfs.map((etf, i) => (
          <button
            key={etf}
            data-testid={`filter-etf-${etf}`}
            onClick={() => setSelectedEtf(selectedEtf === etf ? null : etf)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              selectedEtf === etf
                ? "text-white shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            style={
              selectedEtf === etf
                ? { background: ETF_COLORS[i % ETF_COLORS.length] }
                : {}
            }
          >
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: ETF_COLORS[i % ETF_COLORS.length], opacity: selectedEtf === etf ? 0 : 1 }}
            />
            {etf}
          </button>
        ))}
      </div>

      {/* Treemap SVG */}
      <div ref={containerRef} className="relative w-full" style={{ height: 480 }}>
        <svg
          width={dims.w}
          height={dims.h}
          className="overflow-hidden rounded-lg"
          onMouseLeave={() => setTooltip(null)}
        >
          {rects.map((rect, i) => {
            const color = getColor(rect);
            const showLabel = rect.w > 45 && rect.h > 28;
            const showTicker = rect.w > 28 && rect.h > 18;

            return (
              <g key={`${rect.ticker}-${i}`}>
                <rect
                  data-testid={`treemap-node-${rect.ticker}`}
                  x={rect.x + 1}
                  y={rect.y + 1}
                  width={Math.max(0, rect.w - 2)}
                  height={Math.max(0, rect.h - 2)}
                  rx={4}
                  fill={color}
                  fillOpacity={rect.isShared ? 0.75 : 0.65}
                  stroke={rect.isShared ? "hsl(210 30% 55%)" : color}
                  strokeOpacity={rect.isShared ? 0.8 : 0.4}
                  strokeWidth={rect.isShared ? 1.5 : 1}
                  className="cursor-pointer transition-all duration-150 hover:fill-opacity-90"
                  onMouseEnter={(e) => {
                    setTooltip({ node: rect, x: rect.x + rect.w / 2, y: rect.y });
                  }}
                />
                {showTicker && (
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 + (showLabel ? -6 : 4)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fillOpacity={0.95}
                    fontSize={Math.min(12, rect.w / 4, rect.h / 2.5)}
                    fontWeight="700"
                    fontFamily="'Cabinet Grotesk', sans-serif"
                    style={{ pointerEvents: "none" }}
                  >
                    {rect.ticker.length > 6 ? rect.ticker.substring(0, 5) + "…" : rect.ticker}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fillOpacity={0.65}
                    fontSize={Math.min(9, rect.w / 6, rect.h / 5)}
                    fontFamily="'Satoshi', sans-serif"
                    style={{ pointerEvents: "none" }}
                  >
                    {rect.displayValue.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 bg-popover border border-border rounded-lg p-3 shadow-xl pointer-events-none text-xs min-w-[180px]"
            style={{
              left: Math.min(tooltip.x, dims.w - 200),
              top: Math.max(0, tooltip.y - 10),
              transform: "translate(-50%, -110%)",
            }}
          >
            <p className="font-bold text-foreground">{tooltip.node.ticker}</p>
            <p className="text-muted-foreground truncate" style={{ maxWidth: 180 }}>{tooltip.node.name}</p>
            {selectedEtf ? (
              <p className="mt-1.5 text-foreground">
                Weight in {selectedEtf}:{" "}
                <span className="font-semibold">
                  {(tooltip.node.weightByEtf[selectedEtf] ?? tooltip.node.value).toFixed(2)}%
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-foreground">
                Avg weight: <span className="font-semibold">{tooltip.node.value.toFixed(2)}%</span>
              </p>
            )}
            <p className="mt-0.5">
              Held by:{" "}
              <span className={`font-semibold ${tooltip.node.isShared ? "text-primary" : "text-muted-foreground"}`}>
                {tooltip.node.etfs.join(", ")}
              </span>
            </p>
            {selectedEtf && tooltip.node.isShared && (
              <p className="mt-1 text-muted-foreground text-xs">Also in: {tooltip.node.etfs.filter(e => e !== selectedEtf).join(", ")}</p>
            )}
            {!selectedEtf && tooltip.node.isShared && (
              <p className="mt-1 text-primary text-xs font-medium">⟡ Shared holding</p>
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      {(() => {
        const stats = selectedEtf
          ? [
              { label: "Holdings shown", value: displayItems.length, sub: `in ${selectedEtf}` },
              { label: "Weight covered", value: totalShown.toFixed(1) + "%", sub: "of top holdings" },
              { label: "Shared with others", value: displayItems.filter((n) => n.node.isShared).length, sub: "held by 2+ ETFs" },
            ]
          : [
              { label: "Total unique holdings", value: nodes.length, sub: "across all selected ETFs" },
              { label: "Shared holdings", value: nodes.filter((n) => n.isShared).length, sub: "held by 2+ ETFs" },
              { label: "Exclusive holdings", value: nodes.filter((n) => !n.isShared).length, sub: "unique to one ETF" },
            ];
        return (
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
