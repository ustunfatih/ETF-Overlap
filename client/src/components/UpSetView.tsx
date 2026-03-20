import type { OverlapMatrix } from "@shared/schema";

type UpSetData = {
  sets: string[];
  intersections: { set: string[]; size: number; holdings: string[] }[];
};

type Props = {
  data: UpSetData;
};

const ETF_COLORS = [
  "hsl(210 80% 56%)", "hsl(160 60% 45%)", "hsl(45 90% 55%)", "hsl(280 65% 60%)",
  "hsl(15 80% 55%)", "hsl(190 70% 50%)", "hsl(320 60% 55%)", "hsl(100 55% 48%)",
  "hsl(35 85% 55%)", "hsl(250 65% 62%)",
];

export default function UpSetView({ data }: Props) {
  const { sets, intersections } = data;
  const maxSize = Math.max(...intersections.map((i) => i.size), 1);
  const BAR_MAX_W = 420;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div>
        <h2 className="text-sm font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
          UpSet Intersection Diagram
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each row = holdings exclusive to that combination of ETFs · Sorted by size (largest first)
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap pb-2 border-b border-border">
        {sets.map((etf, i) => (
          <div key={etf} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: ETF_COLORS[i % ETF_COLORS.length] }} />
            <span className="text-xs font-medium">{etf}</span>
          </div>
        ))}
      </div>

      {/* Column headers */}
      <div className="space-y-1.5 overflow-x-auto">
        {/* Header row */}
        <div className="flex items-center gap-0 min-w-[600px]">
          {/* Bar header */}
          <div style={{ width: BAR_MAX_W + 60 }} className="text-xs text-muted-foreground pl-1">
            Holdings count (exclusive to this combination)
          </div>
          {/* Set dots header */}
          {sets.map((etf, i) => (
            <div
              key={etf}
              className="flex flex-col items-center"
              style={{ width: 48 }}
            >
              <span className="text-xs font-semibold" style={{ color: ETF_COLORS[i % ETF_COLORS.length] }}>
                {etf}
              </span>
            </div>
          ))}
        </div>

        {/* Intersection rows */}
        {intersections.slice(0, 15).map((inter, rowIdx) => {
          const barW = (inter.size / maxSize) * BAR_MAX_W;
          const isAll = inter.set.length === sets.length;
          const isSingle = inter.set.length === 1;

          return (
            <div
              key={rowIdx}
              className="flex items-center gap-0 min-w-[600px] group"
              title={`Held exclusively by: ${inter.set.join(" + ")} · ${inter.size} holdings`}
            >
              {/* Bar + count */}
              <div className="flex items-center gap-2" style={{ width: BAR_MAX_W + 60 }}>
                <div
                  className="h-7 rounded-md transition-all duration-200 group-hover:opacity-90"
                  style={{
                    width: barW,
                    minWidth: 4,
                    background: isSingle
                      ? ETF_COLORS[sets.indexOf(inter.set[0]) % ETF_COLORS.length]
                      : isAll
                      ? "hsl(210 15% 55%)"
                      : "linear-gradient(90deg, hsl(210 60% 50%), hsl(280 55% 55%))",
                    opacity: 0.85,
                  }}
                />
                <span
                  className="text-sm font-bold tabular-nums flex-shrink-0"
                  style={{
                    fontFamily: "'Cabinet Grotesk', sans-serif",
                    color: isSingle
                      ? ETF_COLORS[sets.indexOf(inter.set[0]) % ETF_COLORS.length]
                      : "hsl(210 20% 72%)",
                  }}
                >
                  {inter.size}
                </span>
              </div>

              {/* Set membership dots */}
              {sets.map((etf, i) => {
                const inSet = inter.set.includes(etf);
                return (
                  <div key={etf} className="flex items-center justify-center" style={{ width: 48 }}>
                    <div
                      className="rounded-full transition-transform duration-150 group-hover:scale-110"
                      style={{
                        width: inSet ? 14 : 8,
                        height: inSet ? 14 : 8,
                        background: inSet
                          ? ETF_COLORS[i % ETF_COLORS.length]
                          : "hsl(222 14% 24%)",
                        opacity: inSet ? 1 : 0.5,
                      }}
                    />
                  </div>
                );
              })}

              {/* Sample holdings on hover */}
              {inter.holdings.length > 0 && (
                <div className="ml-3 hidden group-hover:flex items-center gap-1 flex-wrap">
                  {inter.holdings.slice(0, 5).map((h) => (
                    <span
                      key={h}
                      className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      {h}
                    </span>
                  ))}
                  {inter.holdings.length > 5 && (
                    <span className="text-xs text-muted-foreground">+{inter.holdings.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {intersections.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No exclusive intersections found. This may indicate high overlap between all selected ETFs.
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Total intersection groups</p>
          <p className="text-xl font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>{intersections.length}</p>
          <p className="text-xs text-muted-foreground">unique combinations shown</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Largest exclusive group</p>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
            {intersections[0]?.size ?? 0}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {intersections[0]?.set.join(" + ") ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
