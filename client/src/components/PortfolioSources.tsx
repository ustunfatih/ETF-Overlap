import type { AssetCategory, EtfData } from "@shared/schema";

const LABELS: Record<AssetCategory, string> = { equity: "Stocks", cash: "Cash", deposit: "Deposits", repo: "Repo", bond: "Bonds", option: "Options", derivative: "Other derivatives", other: "Other assets" };

export default function PortfolioSources({ portfolios, errors }: { portfolios: Record<string, Omit<EtfData, "holdings">>; errors?: string[] }) {
  const reports = Object.values(portfolios);
  const differentDates = new Set(reports.map(report => report.sourceAsOf)).size > 1;
  return (
    <section aria-label="Portfolio data sources" className="space-y-3">
      <p className="text-xs text-muted-foreground">Automatic refresh: Sundays at 20:30 (UTC+3). Portfolio dates reflect each source's latest available report.</p>
      {errors?.length ? <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <p className="font-semibold">Some ETFs could not be included</p>
        {errors.map(error => <p key={error}>{error}</p>)}
      </div> : null}
      {differentDates ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        These portfolios have different report dates. Comparisons reflect each issuer's latest available report, not a single common date.
      </p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(report => (
          <article key={report.etf} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{report.etf}</span>
              <span className={`rounded-full px-2 py-1 text-xs ${report.sourceError ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"}`}>
                {report.sourceError ? "Last healthy report" : report.source === "manual" ? "Manual report" : report.source === "research" ? "Dated research report" : "Dated issuer report"}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Portfolio date</dt><dd className="font-semibold">{report.sourceAsOf || "Unknown"}</dd>
              <dt className="text-muted-foreground">Positions</dt><dd>{report.holdingsCount}</dd>
              <dt className="text-muted-foreground">Net weight represented</dt><dd>{report.coverageWeight?.toFixed(2)}%</dd>
              <dt className="text-muted-foreground">Source</dt><dd>{report.sourceUrl ? <a className="text-primary underline" href={report.sourceUrl} target="_blank" rel="noreferrer">{report.sourceName}</a> : report.sourceName}</dd>
            </dl>
            {report.sourceError ? <div role="status" className="rounded-md bg-amber-500/10 p-2 text-xs break-words">
              <p className="font-medium">Source refresh failed; using the {report.sourceAsOf} portfolio.</p>
              <p className="mt-1">{report.sourceError}</p>
            </div> : null}
            {report.sourceWarning ? <p role="status" className="rounded-md bg-amber-500/10 p-2 text-xs">{report.sourceWarning}</p> : null}
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(report.categoryWeights || {}) as [AssetCategory, number][]).map(([category, weight]) => (
                <span key={category} className="rounded-md border border-border px-2 py-1 text-xs">{LABELS[category]} <strong>{weight.toFixed(2)}%</strong></span>
              ))}
            </div>
            {report.weightMethod === "estimated" ? <p className="rounded-md bg-amber-500/10 p-2 text-xs">Weights estimated from issuer market values because published percentages lose precision. See data details.</p> : null}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Data details</summary>
              <p className="mt-2">Last successful download: {report.fetchedAt.replace("T", " ").slice(0, 19)} UTC</p>
              {report.lastAttemptAt ? <p>Failed refresh: {report.lastAttemptAt.replace("T", " ").slice(0, 19)} UTC</p> : null}
              <p className="mt-1">{report.coverageNote}</p>
            </details>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Overlap sums shared long stock and identifiable bond weights across complete reports. The weight calculation method is shown in data details. Cash, deposits, repo and derivatives are shown separately and do not create security overlap. Short derivatives can have negative weights; reported weights are not economic exposure.
      </p>
    </section>
  );
}
