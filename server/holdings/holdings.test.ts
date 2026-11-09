import assert from "node:assert/strict";
import { test } from "node:test";
import { freshnessReport, sourceFailureIsFatal } from "./freshness";
import { arkHoldings, issuerSourceUrl, kranesharesFile, kranesharesHoldings, tableHoldings, vaneckHoldings } from "./issuers";
import { parseCsv, portfolioDate, validatePortfolio } from "./parsers";
import { secTickers } from "./sec";

const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shiftIso = (iso: string, days: number) => new Date(utcDay(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const usDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
};

test("a portfolio may be dated the next calendar day, and no further", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(portfolioDate(usDate(shiftIso(today, 1))), shiftIso(today, 1));
  assert.throws(() => portfolioDate(usDate(shiftIso(today, 2))), /Portfolio date is in the future/);
});

// The Sunday 17:30 UTC job (run 41351439530 and the three before it) downloaded NEOS
// files already stamped with Monday. Weekday refreshes on Oct 6 and Oct 8 stored that same day.
test("NEOS Sunday file date is the next session, not a shifted parse", () => {
  const sundayNight = new Date("2026-11-01T21:19:45.000Z");
  assert.equal(portfolioDate("10/08/2026", new Date("2026-10-08T15:28:10.000Z")), "2026-10-08");
  assert.equal(portfolioDate("11/02/2026", sundayNight), "2026-11-02");
  assert.throws(() => portfolioDate("11/03/2026", sundayNight), /Portfolio date is in the future/);
});

test("iShares equity files may publish Market Weight instead of Weight (%)", () => {
  const csv = [
    'Fund Holdings as of,"Oct 30, 2026"',
    "Ticker,Name,Asset Class,Market Value,Notional Weight,Market Weight",
    "ESZ6,S&P500 EMINI DEC 26,Futures,0.00,0.12,-",
    "AAPL,APPLE,Equity,60,60,60",
    "MSFT,MICROSOFT,Equity,40,40,40",
  ].join("\n");
  const parsed = tableHoldings(parseCsv(csv), "ishares");
  assert.equal(parsed.date, "2026-10-30");
  assert.equal(parsed.holdings.find(row => row.ticker === "ESZ6")?.weight, 0);
  assert.equal(parsed.holdings.find(row => row.ticker === "ESZ6")?.category, "derivative");
  assert.equal(parsed.holdings.find(row => row.ticker === "AAPL")?.weight, 60);
});

test("iShares files that still publish Weight (%) keep that column", () => {
  const csv = [
    'Fund Holdings as of,"Oct 30, 2026"',
    "Ticker,Name,Asset Class,Market Value,Market Weight,Weight (%)",
    "AAPL,APPLE,Equity,90,10,99.5",
    "USD,USD CASH,Cash,1,1,-0.5",
  ].join("\n");
  const parsed = tableHoldings(parseCsv(csv), "ishares");
  assert.equal(parsed.date, "2026-10-30");
  assert.equal(parsed.holdings.find(row => row.ticker === "AAPL")?.weight, 99.5);
  assert.equal(parsed.holdings.find(row => row.ticker === "USD")?.weight, -0.5);
  assert.equal(parsed.holdings.find(row => row.ticker === "USD")?.category, "cash");
});

test("a holdings file with no weight column is still rejected", () => {
  assert.throws(() => tableHoldings(parseCsv("Ticker,Name\nAAPL,APPLE\n"), "ishares"), /Issuer holdings columns are missing/);
});

test("SSGA contingent lines without a ticker stay out of the equity book", () => {
  const parsed = tableHoldings([
    ["Holdings:", "As of 05-Nov-2026"],
    ["Name", "Ticker", "Identifier", "Weight"],
    ["MODERNA INC", "MRNA", "60770K107", "99.9"],
    ["CONTRA METSERA INC", "", "592CVR013", "0.1"],
  ], "ssga");
  assert.equal(parsed.date, "2026-11-05");
  assert.equal(parsed.holdings.find(row => row.ticker === "MRNA")?.category, "equity");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("CONTRA"))?.category, "other");
});

test("VanEck daily workbook keeps published weights, including cash lines", () => {
  const parsed = vaneckHoldings([
    ["Daily Holdings (%)  11/05/2026"],
    ["Number", "Ticker", "Holding Name", "Identifier (FIGI)", "Shares", "Asset Class", "Market Value (US$)", "Notional Value", "% of Net Assets"],
    ["1", "NVDA", "Nvidia Corp", "BBG000BBJQV0", "67", "Stock", "100", " -- ", "21.00%"],
    ["26", "-USD CASH-", "", " ", "1", "Cash Bal", "1", " -- ", "0.05%"],
    ["27", " -- ", "Other/Cash", " -- ", " -- ", "Cash", "1", " -- ", "0.03%"],
    ["These are not recommendations to buy or to sell any security. Securities and holdings may vary."],
  ]);
  assert.equal(parsed.date, "2026-11-05");
  assert.equal(parsed.holdings.find(row => row.ticker === "NVDA")?.weight, 21);
  assert.equal(parsed.holdings.find(row => row.ticker === "NVDA")?.securityId, "BBG000BBJQV0");
  assert.deepEqual(parsed.holdings.filter(row => row.category === "cash").map(row => [row.ticker, row.weight]), [["", 0.05], ["", 0.03]]);
});

test("KraneShares page points at the latest dated holdings file", () => {
  const html = '<a href="https://kraneshares.com/csv/11_05_2026_kweb_holdings.csv"></a><a href="https://kraneshares.com/csv/11_06_2026_kweb_holdings.csv"></a>';
  assert.equal(kranesharesFile(html, "KWEB"), "https://kraneshares.com/csv/11_06_2026_kweb_holdings.csv");
  assert.throws(() => kranesharesFile("<html></html>", "KWEB"), /KraneShares holdings file link is missing/);
});

test("KraneShares holdings use the published net-asset weight and ISIN", () => {
  const csv = [
    '"KWEB Holdings","As of 2026-11-06","Holdings Are Subject To Change"',
    'Rank,"Company Name","% of Net Assets",Ticker,Identifier,"Shares Held","Market Value($)"',
    '1,"TENCENT HOLDINGS LTD",10.01,700,KYG875721634,"9,240,275","494,709,600"',
    '2,"PDD HOLDINGS INC",8.46,PDD,US7223041028,"5,035,171","418,070,248"',
    '41,Cash,0.18,,–,"9,009,143","9,009,143"',
  ].join("\n");
  const parsed = kranesharesHoldings(csv);
  assert.equal(parsed.date, "2026-11-06");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("TENCENT"))?.ticker, "700");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("TENCENT"))?.securityId, "KYG875721634");
  assert.equal(parsed.holdings.find(row => row.ticker === "PDD")?.weight, 8.46);
  assert.equal(parsed.holdings.find(row => row.name === "Cash")?.category, "cash");
  assert.equal(parsed.holdings.find(row => row.name === "Cash")?.ticker, "");
});

const arkCsv = [
  "date,fund,company,ticker,cusip,shares,market value ($),weight (%)",
  '11/06/2026,ARKK,TESLA INC,TSLA,88160R101,"1","$1",89.25%',
  '11/06/2026,ARKK,ARCTURUS THERAPEUTICS HOLDIN,ARCT UQ,03969T109,"1","$1",5.00%',
  '11/06/2026,ARKK,OPENAI GROUP PBC SERIES C,,PPOPENAIC,"1","$1",4.30%',
  '11/06/2026,ARKK,GOLDMAN FS TRSY OBLIG INST 468,,X9USDGSFT,"1","$1",1.44%',
  '11/06/2026,ARKK,BRERA HOLDINGS PLC WTS,,BREADUMMY,"1","$1",0.01%',
  '"Investors should carefully consider the investment objectives and risks."',
].join("\n");

test("ARK daily file keeps private holdings, cash, and warrants, and drops the venue suffix", () => {
  const parsed = arkHoldings(arkCsv, "ARKK");
  assert.equal(parsed.date, "2026-11-06");
  assert.equal(parsed.holdings.find(row => row.name === "TESLA INC")?.weight, 89.25);
  assert.equal(parsed.holdings.find(row => row.name.startsWith("ARCTURUS"))?.ticker, "ARCT");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("OPENAI"))?.ticker, "PPOPENAIC");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("OPENAI"))?.category, "equity");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("GOLDMAN"))?.category, "cash");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("GOLDMAN"))?.ticker, "");
  assert.equal(parsed.holdings.find(row => row.name.startsWith("BRERA"))?.category, "other");
  const portfolio = validatePortfolio({ etf: "ARKK", holdings: parsed.holdings, sourceAsOf: parsed.date, fetchedAt: "2026-11-09T00:00:00.000Z", source: "issuer", weightMethod: "published", sourceName: "ARK Invest" });
  assert.equal(portfolio.complete, true);
  assert.ok(portfolio.coverageWeight! >= 97 && portfolio.coverageWeight! <= 103);
});

test("ARK file for a different fund is rejected", () => {
  assert.throws(() => arkHoldings(arkCsv, "ARKG"), /ARK returned a different ETF/);
});

test("ARK funds use the current daily CSV, not the stale Space Exploration filename", () => {
  assert.match(issuerSourceUrl("ARKK") || "", /ARK_INNOVATION_ETF_ARKK_HOLDINGS\.csv$/);
  assert.match(issuerSourceUrl("ARKG") || "", /ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS\.csv$/);
  assert.match(issuerSourceUrl("ARKX") || "", /ARK_SPACE_%26_DEFENSE_INNOVATION_ETF_ARKX_HOLDINGS\.csv$/);
  assert.doesNotMatch(issuerSourceUrl("ARKX") || "", /SPACE_EXPLORATION/);
  for (const ticker of ["ARKK", "ARKG", "ARKX"]) assert.equal(secTickers.includes(ticker), false);
});

test("the June 30 N-PORT copy is still too old on the November 8 run", () => {
  const failedRun = new Date("2026-11-08T21:18:44.000Z");
  const report = freshnessReport({ SMH: { sourceAsOf: "2026-06-30", sourceName: "SEC Form N-PORT" } }, failedRun);
  assert.deepEqual(report.warnings, []);
  assert.match(report.problems[0], /SMH: 2026-06-30 is 131 days old \(limit 130, SEC Form N-PORT\)/);
  assert.equal(sourceFailureIsFatal({ sourceAsOf: "2026-06-30", sourceName: "SEC Form N-PORT", complete: true }, false, failedRun), true);
});

test("a failed refresh of a still-current portfolio does not fail the job", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  const kept = { sourceAsOf: "2026-07-31", sourceName: "SEC Form N-PORT", complete: true };
  assert.equal(sourceFailureIsFatal(kept, false, now), false);
  assert.equal(sourceFailureIsFatal(undefined, false, now), true);
  assert.equal(sourceFailureIsFatal(undefined, true, now), false);
  const report = freshnessReport({ ARKK: { ...kept, sourceError: "403 from www.sec.gov" } }, now);
  assert.deepEqual(report.problems, []);
  assert.match(report.warnings[0], /ARKK: last refresh failed: 403 from www.sec.gov/);
});
