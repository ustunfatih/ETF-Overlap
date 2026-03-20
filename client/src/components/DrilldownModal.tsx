import { X, TrendingUp } from "lucide-react";
import type { OverlapCell } from "@shared/schema";

type Props = {
  cell: OverlapCell;
  onClose: () => void;
};

export default function DrilldownModal({ cell, onClose }: Props) {
  const { etfA, etfB, sharedCount, weightedScore, sharedHoldings } = cell;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        data-testid="drilldown-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: "hsl(210 80% 56% / 0.2)", color: "hsl(210 80% 72%)" }}
                >
                  {etfA}
                </span>
                <span className="text-muted-foreground text-xs">∩</span>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: "hsl(160 60% 45% / 0.2)", color: "hsl(160 60% 65%)" }}
                >
                  {etfB}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {sharedCount} shared holdings · {weightedScore}% weighted overlap score
            </p>
          </div>
          <button
            data-testid="button-close-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score strip */}
        <div className="px-5 py-3 flex items-center gap-4 bg-muted/30 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Weighted Score</p>
            <p
              className="text-2xl font-bold tabular-nums"
              style={{
                fontFamily: "'Cabinet Grotesk', sans-serif",
                color:
                  weightedScore > 50
                    ? "hsl(15 80% 65%)"
                    : weightedScore > 25
                    ? "hsl(45 80% 65%)"
                    : "hsl(160 55% 55%)",
              }}
            >
              {weightedScore}%
            </p>
          </div>
          <div className="flex-1">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${weightedScore}%`,
                  background:
                    weightedScore > 50
                      ? "linear-gradient(90deg, hsl(45 80% 55%), hsl(15 80% 55%))"
                      : weightedScore > 25
                      ? "linear-gradient(90deg, hsl(160 55% 45%), hsl(45 75% 55%))"
                      : "hsl(160 55% 45%)",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {weightedScore > 60
                ? "Very high overlap — these ETFs hold similar positions"
                : weightedScore > 35
                ? "Moderate overlap — significant shared exposure"
                : weightedScore > 15
                ? "Low-moderate overlap — some shared holdings"
                : "Low overlap — relatively independent"}
            </p>
          </div>
        </div>

        {/* Holdings table */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border">
            <p className="text-xs font-semibold text-foreground">Shared Holdings ({sharedCount})</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Weight in {etfA}</span>
              <span>Weight in {etfB}</span>
            </div>
          </div>

          {sharedHoldings.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No shared holdings found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sharedHoldings.map((h, i) => {
                const larger = Math.max(h.weightA, h.weightB);
                const ratio = larger > 0 ? Math.min(h.weightA, h.weightB) / larger : 0;

                return (
                  <div
                    key={h.ticker}
                    data-testid={`holding-row-${h.ticker}`}
                    className="px-5 py-2.5 flex items-center gap-3 hover:bg-secondary/40 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{h.ticker}</p>
                      <p className="text-xs text-muted-foreground truncate">{h.name}</p>
                    </div>
                    {/* Weight bars */}
                    <div className="flex items-center gap-2 w-64">
                      <div className="flex-1 text-right">
                        <p className="text-xs font-semibold tabular-nums text-primary">
                          {h.weightA.toFixed(2)}%
                        </p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, h.weightA * 8)}%`, background: "hsl(210 80% 56%)" }}
                          />
                        </div>
                      </div>
                      <div
                        className="w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs"
                        style={{
                          background: `hsl(${100 + ratio * 50} 55% 35% / 0.4)`,
                          color: `hsl(${100 + ratio * 50} 55% 65%)`,
                        }}
                        title={`Weight ratio: ${(ratio * 100).toFixed(0)}%`}
                      >
                        {ratio > 0.8 ? "≈" : ratio > 0.5 ? "~" : "≠"}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold tabular-nums text-right" style={{ color: "hsl(160 60% 55%)" }}>
                          {h.weightB.toFixed(2)}%
                        </p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, h.weightB * 8)}%`, background: "hsl(160 60% 45%)" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
          Weight bars represent relative position sizes · Blue = {etfA} · Green = {etfB}
        </div>
      </div>
    </div>
  );
}
