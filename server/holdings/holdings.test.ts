import assert from "node:assert/strict";
import { test } from "node:test";
import { tableHoldings } from "./issuers";
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
