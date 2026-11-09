import assert from "node:assert/strict";
import { test } from "node:test";
import { kranesharesFile, kranesharesHoldings, tableHoldings, vaneckHoldings } from "./issuers";
import { parseCsv, portfolioDate } from "./parsers";

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
