import { useState } from "react";
import type { OverlapMatrix, OverlapCell } from "@shared/schema";

type Props = {
  matrix: OverlapMatrix;
  onCellClick: (cell: OverlapCell) => void;
};

function scoreToColor(score: number, isDiag: boolean): string {
  if (isDiag) return "hsl(222 14% 22%)";
  if (score === 0) return "hsl(222 14% 14%)";
  // Green-to-red: low overlap = cool blue, high = warm orange/red
  if (score < 10) return `hsl(210 60% ${20 + score * 1.2}% / 0.9)`;
  if (score < 25) return `hsl(${200 - score * 2} 65% ${22 + score * 0.8}% / 0.9)`;
  if (score < 50) return `hsl(${160 - score * 1.5} 70% ${22 + score * 0.5}% / 0.9)`;
  return `hsl(${30 - (score - 50) * 0.4} 80% ${28 + (score - 50) * 0.4}% / 0.9)`;
}

function textColor(score: number, isDiag: boolean): string {
  if (isDiag) return "hsl(210 10% 55%)";
  if (score < 5) return "hsl(210 10% 50%)";
  if (score < 20) return "hsl(210 60% 75%)";
  if (score < 40) return "hsl(180 50% 75%)";
  return "hsl(35 80% 80%)";
}

export default function HeatmapView({ matrix, onCellClick }: Props) {
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const { etfs, cells } = matrix;
  const n = etfs.length;

  // Determine cell size based on number of ETFs
  const cellPx = n <= 4 ? 110 : n <= 6 ? 90 : n <= 8 ? 76 : 64;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
            Pairwise Overlap Matrix
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Color = weighted overlap score · Number = shared holdings count · Click any cell to drill down
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">0%</span>
          <div
            className="h-3 w-32 rounded-sm"
            style={{
              background: "linear-gradient(to right, hsl(210 60% 22%), hsl(160 65% 30%), hsl(45 70% 34%), hsl(20 80% 38%))",
            }}
          />
          <span className="text-xs text-muted-foreground">100%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `80px repeat(${n}, ${cellPx}px)`,
            gridTemplateRows: `${cellPx * 0.5}px repeat(${n}, ${cellPx * 0.7}px)`,
            gap: 2,
          }}
        >
          {/* Top-left empty cell */}
          <div />
          {/* Column headers */}
          {etfs.map((etf, j) => (
            <div
              key={`col-${etf}`}
              className={`flex items-end justify-center pb-1.5 text-xs font-semibold transition-opacity ${
                hovered && hovered[1] !== j ? "opacity-40" : "opacity-100"
              }`}
              style={{
                color:
                  hovered && hovered[1] === j
                    ? `hsl(${(j * 37 + 210) % 360} 70% 65%)`
                    : undefined,
              }}
            >
              {etf}
            </div>
          ))}

          {/* Rows */}
          {etfs.map((etfA, i) => (
            <>
              {/* Row label */}
              <div
                key={`row-label-${etfA}`}
                className={`flex items-center justify-end pr-2.5 text-xs font-semibold transition-opacity ${
                  hovered && hovered[0] !== i ? "opacity-40" : "opacity-100"
                }`}
                style={{
                  color:
                    hovered && hovered[0] === i
                      ? `hsl(${(i * 37 + 210) % 360} 70% 65%)`
                      : undefined,
                }}
              >
                {etfA}
              </div>
              {/* Row cells */}
              {etfs.map((etfB, j) => {
                const cell = cells[i][j];
                const isDiag = i === j;
                const isHovered = hovered && hovered[0] === i && hovered[1] === j;
                const isHighlighted =
                  hovered && (hovered[0] === i || hovered[1] === j);

                return (
                  <div
                    key={`cell-${i}-${j}`}
                    data-testid={`heatmap-cell-${etfA}-${etfB}`}
                    className="heatmap-cell rounded-md flex flex-col items-center justify-center cursor-pointer select-none"
                    style={{
                      background: scoreToColor(cell.weightedScore, isDiag),
                      opacity: hovered && !isHighlighted ? 0.35 : 1,
                      transform: isHovered ? "scale(1.06)" : undefined,
                      boxShadow: isHovered ? "0 0 0 2px hsl(210 80% 56%)" : undefined,
                    }}
                    onMouseEnter={() => setHovered([i, j])}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => !isDiag && onCellClick(cell)}
                    title={
                      isDiag
                        ? `${etfA}: ${cell.sharedCount} holdings`
                        : `${etfA} ∩ ${etfB}: ${cell.sharedCount} shared · ${cell.weightedScore}% overlap`
                    }
                  >
                    {isDiag ? (
                      <span
                        className="text-xs font-bold leading-none"
                        style={{ color: "hsl(210 10% 55%)", fontFamily: "'Cabinet Grotesk', sans-serif" }}
                      >
                        {etfA}
                      </span>
                    ) : (
                      <>
                        <span
                          className="font-bold leading-none tabular-nums"
                          style={{
                            fontSize: cellPx > 76 ? 20 : 15,
                            color: textColor(cell.weightedScore, isDiag),
                            fontFamily: "'Cabinet Grotesk', sans-serif",
                          }}
                        >
                          {cell.weightedScore < 1 ? "<1" : cell.weightedScore.toFixed(0)}%
                        </span>
                        <span
                          className="text-xs tabular-nums mt-0.5 leading-none"
                          style={{ color: textColor(cell.weightedScore, isDiag), opacity: 0.7 }}
                        >
                          {cell.sharedCount} stocks
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
        {(() => {
          const offDiag = cells.flatMap((row, i) =>
            row.filter((_, j) => j > i)
          );
          const maxCell = offDiag.reduce((a, b) => (b.weightedScore > a.weightedScore ? b : a), offDiag[0]);
          const minCell = offDiag.reduce((a, b) => (b.weightedScore < a.weightedScore ? b : a), offDiag[0]);
          const avg = offDiag.reduce((s, c) => s + c.weightedScore, 0) / offDiag.length;

          return [
            { label: "Highest Overlap", value: `${maxCell?.etfA} & ${maxCell?.etfB}`, sub: `${maxCell?.weightedScore.toFixed(1)}%` },
            { label: "Avg Overlap Score", value: `${avg.toFixed(1)}%`, sub: `across ${offDiag.length} pairs` },
            { label: "Lowest Overlap", value: `${minCell?.etfA} & ${minCell?.etfB}`, sub: `${minCell?.weightedScore.toFixed(1)}%` },
          ];
        })().map((stat) => (
          <div key={stat.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
