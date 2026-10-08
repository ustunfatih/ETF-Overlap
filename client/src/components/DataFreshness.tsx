import { useQuery } from "@tanstack/react-query";
import type { EtfData } from "@shared/schema";
import { ageDays, ageLabel, isStale } from "@/lib/freshness";

type Snapshot = Pick<EtfData, "etf" | "sourceAsOf" | "sourceName" | "source" | "holdingsCount" | "sourceError">;

export default function DataFreshness() {
  const { data } = useQuery<{ snapshots: Snapshot[] }>({ queryKey: ["/api/etf/status"] });
  const snapshots = [...(data?.snapshots || [])].sort((a, b) => (a.sourceAsOf || "").localeCompare(b.sourceAsOf || ""));
  if (!snapshots.length) return null;
  const stale = snapshots.filter(isStale).length;
  return (
    <details className="rounded-xl border border-border bg-card p-4 text-xs" aria-label="Data freshness">
      <summary className="cursor-pointer font-semibold">
        Data freshness: {snapshots.length} ETFs available{stale ? `, ${stale} older than expected` : ", all reports current"}
      </summary>
      <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {snapshots.map(snapshot => (
          <div key={snapshot.etf} className="flex items-baseline justify-between gap-2 border-b border-border/50 py-1">
            <span className="font-semibold">{snapshot.etf}</span>
            <span className={isStale(snapshot) ? "text-amber-600" : "text-muted-foreground"}>
              {snapshot.sourceAsOf || "undated"} ({ageLabel(ageDays(snapshot.sourceAsOf))}) · {snapshot.sourceName}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
