export const NPORT_MAX_AGE_DAYS = 130; // quarterly filing, published up to 60 days late
export const DEFAULT_MAX_AGE_DAYS = 60;

export function maxPortfolioAgeDays(sourceName?: string, override = process.env.MAX_PORTFOLIO_AGE_DAYS): number {
  if (sourceName === "SEC Form N-PORT") return NPORT_MAX_AGE_DAYS;
  const parsed = Number(override);
  return parsed > 0 ? parsed : DEFAULT_MAX_AGE_DAYS;
}

export function portfolioAgeDays(sourceAsOf: string | undefined, now = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(`${sourceAsOf}T00:00:00Z`)) / 86_400_000);
}

export type DatedPortfolio = { sourceAsOf?: string; sourceName?: string; sourceError?: string; complete?: boolean };

export function assessFreshness(portfolio: DatedPortfolio, now = new Date()) {
  const age = portfolioAgeDays(portfolio.sourceAsOf, now);
  const limit = maxPortfolioAgeDays(portfolio.sourceName);
  return { age, limit, badlyStale: !Number.isFinite(age) || age > limit };
}

/** A retained portfolio may keep being served only while its report date is inside the source's age limit. */
export function retainedPortfolioIsCurrent(portfolio: DatedPortfolio | undefined, now = new Date()): boolean {
  if (!portfolio?.sourceAsOf || portfolio.complete === false) return false;
  return !assessFreshness(portfolio, now).badlyStale;
}

/**
 * Optional SEC-only extras never fail the refresh by themselves.
 * A mapped fund fails the job only when the portfolio we would keep serving is missing or past its age limit.
 */
export function sourceFailureIsFatal(kept: DatedPortfolio | undefined, optional: boolean, now = new Date()): boolean {
  if (optional) return false;
  return !retainedPortfolioIsCurrent(kept, now);
}

export function freshnessReport(data: Record<string, DatedPortfolio>, now = new Date()) {
  const problems: string[] = [];
  const warnings: string[] = [];
  for (const [ticker, portfolio] of Object.entries(data)) {
    const { age, limit, badlyStale } = assessFreshness(portfolio, now);
    if (!Number.isFinite(age)) problems.push(`${ticker}: portfolio date missing`);
    else if (badlyStale) problems.push(`${ticker}: ${portfolio.sourceAsOf} is ${age} days old (limit ${limit}, ${portfolio.sourceName})`);
    if (portfolio.sourceError) {
      const line = `${ticker}: last refresh failed: ${portfolio.sourceError}`;
      if (badlyStale || !Number.isFinite(age)) problems.push(line);
      else warnings.push(`${line}; retained portfolio is ${age} days old (limit ${limit})`);
    }
  }
  return { problems, warnings };
}
