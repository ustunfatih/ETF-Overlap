import axios from "axios";
import { load } from "cheerio";
import type { AssetCategory, EtfData, HoldingRow } from "@shared/schema";
import { classify, numericWeight, portfolioDate, validatePortfolio } from "./parsers";

// SEC requires a descriptive User-Agent with contact details: https://www.sec.gov/os/webmaster-faq#developers
const headers = { "User-Agent": process.env.SEC_USER_AGENT || "ETF-Overlap/1.0 (https://github.com/ustunfatih/etf-overlap)", "Accept-Encoding": "gzip, deflate" };

// ETFs without a free issuer file that still file Form N-PORT (1940 Act funds). Commodity trusts such as GLD/SLV/IAU do not.
export const secTickers = ["ARKK", "ARKG", "ARKX", "XBI", "IBB", "SMH", "SOXX", "KWEB", "EIS"];

let seriesIndex: Promise<Map<string, { cik: number; seriesId: string }>> | undefined;
async function loadSeriesIndex() {
  const data: any = await secGet("https://www.sec.gov/files/company_tickers_mf.json", { maxContentLength: 20_000_000 });
  const fields: string[] = data?.fields || [];
  const [cik, seriesId, symbol] = ["cik", "seriesId", "symbol"].map(field => fields.indexOf(field));
  if (!Array.isArray(data?.data) || [cik, seriesId, symbol].some(index => index < 0)) throw new Error("SEC fund ticker list format changed");
  const index = new Map<string, { cik: number; seriesId: string }>();
  for (const row of data.data) index.set(String(row[symbol]).toUpperCase(), { cik: Number(row[cik]), seriesId: String(row[seriesId]) });
  return index;
}

const CATEGORY: Record<string, AssetCategory> = { EC: "equity", EP: "equity", DBT: "bond", LON: "bond", "ABS-MBS": "bond", "ABS-CBDO": "bond", "ABS-O": "bond", "ABS-APCP": "bond", "ABS-EE": "bond", STIV: "cash", RA: "repo", SN: "derivative", COMM: "other", RE: "other", OTHER: "other" };
export function categoryFor(assetCat: string, name: string, ticker: string): AssetCategory {
  if (/^D/.test(assetCat) && assetCat !== "DBT") return "derivative";
  return CATEGORY[assetCat] ?? classify(name, "", ticker);
}

/** Parses an SEC Form N-PORT primary_doc.xml into a validated portfolio. */
export function parseNportXml(xml: string, etf: string, expectedSeriesId?: string): EtfData {
  const $ = load(xml.replace(/<(\/?)[A-Za-z0-9_-]+:/g, "<$1"), { xmlMode: true });
  const series = $("genInfo > seriesId").first().text().trim();
  if (expectedSeriesId && series !== expectedSeriesId) throw new Error("SEC filing belongs to a different fund series");
  const date = portfolioDate($("genInfo > repPdDate").first().text().trim());
  const netAssets = Number($("fundInfo > netAssets").first().text());
  const holdings: HoldingRow[] = [];
  $("invstOrSec").each((_, element) => {
    const item = $(element);
    const name = item.children("name").text().trim() || item.children("title").text().trim();
    const identifiers = item.children("identifiers");
    const isin = identifiers.find("isin").attr("value") || "";
    const cusip = item.children("cusip").text().trim() || identifiers.find("cusip").attr("value") || "";
    const ticker = identifiers.find("ticker").attr("value")?.trim() || "";
    const securityId = isin || (cusip && cusip !== "000000000" ? cusip : "") || undefined;
    // Securities-lending collateral inflates the total above 100% of net assets and is not a fund exposure.
    if (item.find("isCashCollateral").text().trim() === "Y" || item.find("isNonCashCollateral").text().trim() === "Y") return;
    let category = categoryFor(item.children("assetCat").text().trim(), name, ticker);
    if (category === "equity" && !ticker && !securityId) category = "other"; // unidentifiable line, e.g. a private holding
    holdings.push({ ticker: ticker || securityId || "", name, weight: numericWeight(item.children("pctVal").text()), category, securityId });
  });
  const portfolio = validatePortfolio({ etf, holdings, sourceAsOf: date, fetchedAt: new Date().toISOString(), source: "sec", weightMethod: "published", sourceName: "SEC Form N-PORT", isFallback: false,
    sourceWarning: "No free daily issuer file is mapped for this ETF. Using the SEC's public Form N-PORT filing, which is quarterly and published up to 60 days after the report date.",
    coverageNote: `Complete SEC N-PORT report${Number.isFinite(netAssets) && netAssets > 0 ? ` (net assets $${Math.round(netAssets).toLocaleString("en-US")})` : ""}. Weights are the filed % of net asset value. Derivatives are weights, not economic exposure.` });
  return portfolio;
}

async function secGet(url: string, config: Record<string, unknown> = {}): Promise<unknown> {
  try { return (await axios.get(url, { headers, timeout: 30000, ...config })).data; }
  catch (error: any) { const text = typeof error.response?.data === "string" ? error.response.data.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const body = text ? ` [${text}]` : ""; throw new Error(`${error.response?.status ?? error.code ?? "request failed"}${body} from ${new URL(url).host}${new URL(url).pathname}${error.response?.status === 403 ? " (the SEC rejects requests without a User-Agent that includes contact details; set SEC_USER_AGENT)" : ""}`); }
}

export async function fetchSecPortfolio(ticker: string): Promise<EtfData> {
  const upper = ticker.trim().toUpperCase();
  seriesIndex ??= loadSeriesIndex().catch(error => { seriesIndex = undefined; throw error; });
  const fund = (await seriesIndex).get(upper);
  if (!fund) throw new Error(`${upper} is not a registered fund in the SEC ticker list (commodity trusts and foreign funds do not file Form N-PORT).`);
  const feed = String(await secGet(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${fund.seriesId}&type=NPORT-P&dateb=&owner=include&count=10&output=atom`, { maxContentLength: 5_000_000 }));
  const feedDocument = load(feed, { xmlMode: true });
  let filingUrl = "";
  feedDocument("entry").each((_, entry) => {
    const type = feedDocument(entry).find("filing-type").first().text();
    const href = feedDocument(entry).find("filing-href").first().text();
    if (!filingUrl && /^NPORT-P/.test(type) && href) filingUrl = href;
  });
  if (!filingUrl) throw new Error(`No public SEC N-PORT filing found for ${upper}`);
  const folder = filingUrl.replace(/\/[^/]*$/, "");
  if (new URL(folder).hostname !== "www.sec.gov") throw new Error("Unexpected SEC filing location");
  const xml = String(await secGet(`${folder}/primary_doc.xml`, { maxContentLength: 50_000_000 }));
  const portfolio = parseNportXml(xml, upper, fund.seriesId);
  return { ...portfolio, sourceUrl: `${folder}/primary_doc.xml` };
}
