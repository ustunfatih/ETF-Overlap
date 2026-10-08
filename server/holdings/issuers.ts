import axios from "axios";
import { load } from "cheerio";
import { read as readWorkbook, utils as workbookUtils } from "@e965/xlsx";
import type { AssetCategory, EtfData, HoldingRow } from "@shared/schema";
import { fetchSecPortfolio } from "./sec";
import { classify, numericWeight, parseCsv, parseXlsx, portfolioDate, validatePortfolio } from "./parsers";

type Issuer = { name: string; format: "ssga" | "neos" | "invesco" | "vanguard" | "ishares" | "schwab" | "jpmorgan" | "fidelity"; url: string; altUrl?: string };
const sources: Record<string, Issuer> = {};
for (const ticker of ["SPY", "XLK", "XLF", "XLE", "XLY", "XLP", "XLV", "XLI", "XLB", "XLU", "XLRE", "XLC", "DIA", "MDY"]) {
  sources[ticker] = { name: "State Street", format: "ssga", url: `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${ticker.toLowerCase()}.xlsx` };
}
for (const ticker of ["SPYI", "QQQI", "CSHI", "BNDI", "IWMI"]) {
  sources[ticker] = { name: "NEOS", format: "neos", url: `https://neosfunds.com/wp-admin/admin-ajax.php?action=download_holdings_csv&ticker=${ticker}` };
}
sources.QQQ = { name: "Invesco", format: "invesco", url: "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF" };
for (const [ticker, id] of Object.entries({ VOO: "0968", VTI: "0970", VUG: "0967", VYMI: "4430", VEA: "0936", VWO: "0964", VTV: "0966", BND: "0928", VXUS: "3369", VIG: "0920", VYM: "0923" })) {
  sources[ticker] = { name: "Vanguard", format: "vanguard", url: `https://advisors.vanguard.com/investments/products/api/funds/${id}/holdings/latest` };
}
for (const [ticker, path] of Object.entries({ IVV: "239726/ishares-core-sp-500-etf", AGG: "239458/ishares-core-total-us-bond-market-etf", IWM: "239710/ishares-russell-2000-etf", TLT: "239454/ishares-20-year-treasury-bond-etf" })) {
  sources[ticker] = { name: "iShares", format: "ishares", url: `https://www.ishares.com/us/products/${path}/latest-holdings.csv`,
    // The static CSV can be served from a stale CDN copy; the ajax export is generated on request.
    altUrl: `https://www.ishares.com/us/products/${path}/1467271812596.ajax?fileType=csv&fileName=${ticker}_holdings&dataType=fund` };
}
// SCHB and SCHX are not supported: the Schwab research table repeats and drops rows across pages for funds with thousands of tied tail weights, so completeness cannot be verified.
for (const ticker of ["SCHD", "SCHG"]) {
  sources[ticker] = { name: "Schwab", format: "schwab", url: `https://www.schwabassetmanagement.com/allholdings/${ticker.toLowerCase()}?page=0` };
}
for (const [ticker, cusip] of Object.entries({ JEPI: "46641Q332", JEPQ: "46654Q203" })) {
  sources[ticker] = { name: "J.P. Morgan", format: "jpmorgan", url: `https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=${cusip}&country=us&role=adv&fundType=ETF&locale=en_US&isUnderlyingHolding=false&isProxyHolding=false` };
}

sources.FDVV = { name: "Fidelity", format: "fidelity", url: "https://fundresearch.fidelity.com/prospectus/eproredirect?clientId=Fidelity&applicationId=ETF&securityIdType=CUSIP&critical=N&securityId=316092840" };

export const supportedTickers = Object.keys(sources);
export function issuerStatus() {
  return { freeSourcesOnly: true, supportedTickers, providers: [...new Set(Object.values(sources).map(s => s.name))] };
}

function tableHoldings(rows: string[][], format: "ssga" | "neos" | "ishares"): { holdings: HoldingRow[]; date: string; note?: string } {
  const headerIndex = rows.findIndex(row => row.includes(format === "neos" ? "Weightings" : format === "ssga" ? "Weight" : "Weight (%)"));
  if (headerIndex < 0) throw new Error("Issuer holdings columns are missing");
  const header = rows[headerIndex];
  const symbolIndex = header.indexOf(format === "neos" ? "StockTicker" : "Ticker");
  const nameIndex = header.indexOf(format === "neos" ? "SecurityName" : "Name");
  const weightIndex = header.indexOf(format === "neos" ? "Weightings" : format === "ssga" ? "Weight" : "Weight (%)");
  if (nameIndex < 0 || (symbolIndex < 0 && !header.includes("ISIN"))) throw new Error("Issuer security columns are missing");
  const holdings: HoldingRow[] = [];
  const dates = new Set<string>();
  const marketValues: number[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row[nameIndex]?.trim()) {
      if (format === "ishares") break; // Footer follows the complete holdings table.
      continue;
    }
    if (!row[weightIndex]?.trim()) {
      if (format === "ssga") break; // Legal text below the worksheet table.
      throw new Error("Position weight is missing");
    }
    const name = row[nameIndex].trim(), ticker = (row[symbolIndex] || row[header.indexOf("ISIN")] || "").trim();
    let type = format === "ishares" ? row[header.indexOf("Asset Class")] || "" : "";
    if (format === "neos" && row[header.indexOf("MoneyMarketFlag")] === "Y") type = "Cash";
    const category = (ticker === "-" || !ticker) && numericWeight(row[weightIndex]) === 0 ? "other" : classify(name, type, ticker);
    holdings.push({ ticker: ticker === "-" ? "" : ticker, name, weight: numericWeight(row[weightIndex]), category,
      securityId: row[header.indexOf("ISIN")] || row[header.indexOf("CUSIP")] || row[header.indexOf(format === "neos" ? "Cusip" : "Identifier")] || undefined });
    if (format === "ishares") marketValues.push(numericWeight(row[header.indexOf("Market Value")]));
    if (format === "neos") dates.add(portfolioDate(row[header.indexOf("Date")]));
  }
  if (format === "neos" && dates.size !== 1) throw new Error("Portfolio positions have inconsistent dates");
  const rawDate = format === "neos" ? [...dates][0] : rows.find(row => row[0] === (format === "ssga" ? "Holdings:" : "Fund Holdings as of"))?.[1];
  let note: string | undefined;
  const publishedTotal = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (format === "ishares" && publishedTotal < 97) {
    const totalValue = marketValues.reduce((sum, value) => sum + value, 0);
    if (totalValue <= 0) throw new Error("Invalid issuer net market value");
    holdings.forEach((holding, index) => { holding.weight = marketValues[index] / totalValue * 100; });
    note = "Issuer percentages lose precision across thousands of positions. Weights are calculated from each position's market value divided by the net market value of the complete issuer file.";
  }
  return { holdings, date: portfolioDate(rawDate), note };
}

async function fetchPrimaryPortfolio(ticker: string, useAlt = false): Promise<EtfData> {
  const upper = ticker.toUpperCase().trim();
  const source = sources[upper];
  if (upper === "GLDW") throw new Error("GLDW was liquidated in September 2019; no current portfolio exists.");
  if (!source) throw new Error(`No verified free automatic full-portfolio source for ${upper}.`);
  const sourceUrl = useAlt && source.altUrl ? source.altUrl : source.url;
  const response = await axios.get(sourceUrl, {
    responseType: source.format === "ssga" || source.format === "jpmorgan" ? "arraybuffer" : "text", timeout: 20000,
    maxContentLength: 20_000_000,
    headers: { "User-Agent": "ETF-Overlap/1.0 (public ETF holdings reader)", Accept: "*/*", "Cache-Control": "no-cache" },
  });
  let holdings: HoldingRow[], date: string;
  let precisionNote = "Weights use the issuer's published precision.";
  let weightMethod: EtfData["weightMethod"] = "published";
  if (source.format === "fidelity") {
    const redirect = String(response.data).match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (!redirect || new URL(redirect).hostname !== "www.actionsxchangerepository.fidelity.com") throw new Error("Fidelity report directory redirect is missing");
    const envelope = String((await axios.get(redirect, { timeout: 20000, maxContentLength: 5_000_000 })).data);
    const menu = load(envelope)("#DALYTab").closest("td").attr("onclick") || "";
    const fields = [...menu.matchAll(/'([^']*)'/g)].map(match => match[1]);
    if (fields[2] !== "DALY" || fields[4] !== "316092840" || fields[21] !== `${upper}_Holdings.xls` || !fields[22]?.startsWith("_fax=")) throw new Error("Fidelity daily Excel report link is missing");
    const downloadUrl = `https://www.actionsxchangerepository.fidelity.com/ShowDocument/documentExcel.htm?${fields[22]}`;
    const bytes = (await axios.get(downloadUrl, { responseType: "arraybuffer", timeout: 20000, maxContentLength: 5_000_000 })).data;
    const workbook = readWorkbook(Buffer.from(bytes), { type: "buffer", cellFormula: false, cellHTML: false });
    const rows = workbookUtils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: "" });
    if (rows.find(row => row[0] === "Ticker Symbol:")?.[1] !== upper) throw new Error("Fidelity returned a different ETF");
    date = portfolioDate(rows.find(row => row[0] === "Holding as of:")?.[1]);
    const index = rows.findIndex(row => row.includes("% of Net Assets"));
    if (index < 0) throw new Error("Fidelity portfolio columns are missing");
    const header = rows[index];
    holdings = [];
    let foundTotal = false;
    for (const row of rows.slice(index + 1)) {
      const name = row[header.indexOf("Security Name")];
      if (name === "Total:") {
        if (numericWeight(row[header.indexOf("% of Net Assets")]) !== 100) throw new Error("Fidelity portfolio total is invalid");
        foundTotal = true; break;
      }
      if (!name) continue;
      const ticker = row[header.indexOf("Ticker")], isin = row[header.indexOf("ISIN")], sedol = row[header.indexOf("SEDOL")];
      const foreign = isin && !isin.startsWith("US");
      const type = row[header.indexOf("Security Type")];
      holdings.push({ ticker: ticker || isin || sedol || "", name, weight: numericWeight(row[header.indexOf("% of Net Assets")]),
        category: type === "Central Fund" && /CASH|SECURITIES LENDING/.test(name) ? "cash" : type === "Currency Contract" ? "derivative" : name === "NET OTHER ASSETS" ? "other" : classify(name, type, ticker),
        securityId: foreign && sedol ? `SEDOL:${sedol}` : isin || row[header.indexOf("Live Cusip")] || undefined });
    }
    if (!foundTotal) throw new Error("Fidelity daily report is truncated");
    precisionNote = "Official daily holdings report, including cash, derivatives and net other assets, with published percentage precision. Fidelity notes that some small positions may be omitted and the report is unaudited.";
  } else if (source.format === "ssga" || source.format === "neos" || source.format === "ishares") {
    const rows = source.format === "ssga" ? parseXlsx(Buffer.from(response.data)) : parseCsv(String(response.data).replace(/^\uFEFF/, ""));
    const parsed = tableHoldings(rows, source.format);
    ({ holdings, date } = parsed);
    if (parsed.note) { precisionNote = parsed.note; weightMethod = "market-value"; }
    if (source.format === "ssga" && rows.find(row => row[0] === "Ticker Symbol:")?.[1] !== upper) throw new Error("Issuer returned a different ETF");
  } else if (source.format === "jpmorgan") {
    const rows = parseXlsx(Buffer.from(response.data));
    const index = rows.findIndex(row => row.includes("% of Net Assets"));
    if (index < 0) throw new Error("J.P. Morgan holdings columns are missing");
    const header = rows[index];
    date = portfolioDate(rows.flat().find(cell => cell?.startsWith("As of Date:"))?.replace("As of Date:", ""));
    holdings = [];
    for (const row of rows.slice(index + 1)) {
      const name = row[header.indexOf("Security Description")];
      if (!name) continue;
      const weight = row[header.indexOf("% of Net Assets")];
      if (!weight?.trim()) break;
      const ticker = row[header.indexOf("Ticker")] || "";
      holdings.push({ ticker, name, weight: numericWeight(weight), category: classify(name, row[header.indexOf("Security Type")], ticker) });
    }
  } else if (source.format === "invesco") {
    const payload = JSON.parse(response.data);
    date = portfolioDate(payload.effectiveDate);
    if (!Array.isArray(payload.holdings) || payload.holdings.length !== payload.totalNumberOfHoldings) throw new Error("Invesco returned an incomplete portfolio");
    holdings = payload.holdings.map((row: Record<string, unknown>) => ({
      ticker: String(row.ticker || ""), name: load(String(row.issuerName || "")).text(),
      weight: row.percentageOfTotalNetAssets == null && row.units === 0 ? 0 : numericWeight(row.percentageOfTotalNetAssets), securityId: String(row.cusip || ""),
      category: classify(String(row.issuerName || ""), String(row.securityTypeName || "")),
    }));
  } else if (source.format === "vanguard") {
    const payload = JSON.parse(response.data);
    date = portfolioDate(payload.latestEffectiveDate);
    const report = payload[date];
    if (!report || !Array.isArray(report.equity) || !Array.isArray(report.fixedIncome)) throw new Error("Vanguard portfolio is missing");
    const anchors = [...report.equity, ...report.fixedIncome].filter(row => Number(row.percentOfFunds) > 0.01);
    const nav = anchors.reduce((sum, row) => sum + Number(row.marketValue), 0) / anchors.reduce((sum, row) => sum + Number(row.percentOfFunds), 0) * 100;
    const international = ["VYMI", "VEA", "VWO", "VXUS"].includes(upper);
    holdings = [];
    const groups: Record<string, AssetCategory> = { equity: "equity", fixedIncome: "bond", shortTermReserves: "cash", derivatives: "derivative" };
    for (const [key, group] of Object.entries(groups)) {
      if (!Array.isArray(report[key])) throw new Error(`Vanguard ${key} positions are missing`);
      for (const row of report[key]) {
        const name = String(row.holdingName || row.description || "");
        const classified = classify(name);
        const belowPrecision = row.percentOfFunds === "" && (row.marketValue === "" || nav > 0 && Math.abs(numericWeight(row.marketValue)) / nav * 100 < 0.000005);
        const category = group === "equity" ? classified === "other" || !row.ticker && !row.cusip && !row.sedol ? "other" : "equity" : group === "bond" ? "bond" : classified === "equity" ? group : classified;
        const securityId = international && group === "equity" && row.sedol ? `SEDOL:${row.sedol}` : String(row.cusip || row.sedol || "");
        holdings.push({ ticker: String(row.ticker || securityId || ""), name, securityId, category,
          weight: belowPrecision ? 0 : numericWeight(row.percentOfFunds) });
      }
    }
    precisionNote = "Vanguard publishes full monthly portfolios with five-decimal percentage weights. Positions with blank weights and blank market values, or values below 0.000005%, remain visible at zero weight. Report date is the issuer's portfolio valuation date, not the download date.";
  } else {
    const first = load(response.data);
    const firstText = first("body").text().replace(/\s+/g, " ");
    const count = firstText.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+(\d+)/i);
    if (!count) throw new Error("Schwab full holdings page unavailable (access denied or changed format)");
    const expected = Number(count[1]);
    if (expected < 1 || expected > 10000) throw new Error("Invalid Schwab holdings count");
    const pages = [response.data];
    for (let page = 1; page < Math.ceil(expected / 100); page++) {
      pages.push((await axios.get(source.url.replace("page=0", `page=${page}`), { timeout: 20000, maxContentLength: 20_000_000 })).data);
    }
    holdings = [];
    const dates = new Set<string>();
    for (const html of pages) {
      const $ = load(html);
      const text = $("body").text().replace(/\s+/g, " ");
      dates.add(portfolioDate(text.match(/as of\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1]));
      const pattern = /([^%]+?)\s+CUSIP\s+(\S+)\s+Symbol\s+(\S+)\s+Quantity\s+[\d,.-]+\s+% of Assets\s+(-?[\d.]+)%\s+Market Value\s+\S+/g;
      for (const match of text.matchAll(pattern)) {
        const name = match[1].replace(/^.*Displaying\s+\d+\s*-\s*\d+\s+of\s+\d+\s*/i, "").trim();
        holdings.push({ ticker: match[3] === "--" ? "" : match[3], name, securityId: match[2], weight: numericWeight(match[4]), category: classify(name) });
      }
    }
    if (dates.size !== 1 || holdings.length !== expected) throw new Error("Schwab returned an incomplete or inconsistent portfolio");
    date = [...dates][0];
  }
  return validatePortfolio({ etf: upper, holdings, sourceAsOf: date, fetchedAt: new Date().toISOString(), source: "issuer",
    weightMethod,
    sourceName: source.name, sourceUrl, isFallback: false,
    coverageNote: `Complete issuer holdings file. ${precisionNote} Derivatives are published weights, not economic exposure.` });
}


type ResearchNode = { t?: string; a?: Record<string, unknown>; c?: (ResearchNode | string | number)[] };
function researchText(node: ResearchNode | string | number): string {
  if (typeof node === "number") return String(node);
  return typeof node === "string" ? node.replace(/%u([a-f0-9]{4})|%([a-f0-9]{2})/gi, (_, unicode, byte) => String.fromCharCode(parseInt(unicode || byte, 16))) : (node.c || []).map(researchText).join(" ");
}
function researchFind(node: ResearchNode, predicate: (node: ResearchNode) => boolean): ResearchNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.c || []) {
    if (typeof child === "object") { const found = researchFind(child, predicate); if (found) return found; }
  }
}
async function fetchSchwabResearch(ticker: string, primaryError: string): Promise<EtfData> {
  const url = `https://www.schwab.wallst.com/schwab/Prospect/research/etfs/schwabETF/index.asp?symbol=${ticker}&type=holdings`;
  const headers = { "User-Agent": "Mozilla/5.0", Referer: url };
  const html = String((await axios.get(url, { headers, timeout: 20000, maxContentLength: 5_000_000 })).data);
  const issue = html.match(/gSymbolWSODIssue\s*=\s*['"](\d+)['"]/)?.[1];
  const session = html.match(/WSOD_DATA\.sessionID\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const date = portfolioDate(html.match(/gHoldingsAsOfDate\s*=\s*['"]([^'"]+)['"]/)?.[1]);
  const $ = load(html);
  const expected = Number($("body").text().replace(/\s+/g, " ").match(/([\d,]+) Total Holdings/i)?.[1]?.replace(/,/g, ""));
  if (!issue || !session || !expected || expected > 10000 || $("#holdingsTableContainer").attr("fundtype") !== "schwab") throw new Error("Schwab research full-portfolio metadata is missing");
  const holdings: HoldingRow[] = [];
  // The "Total Holdings" headline can lag the table by a few rows (cash and other lines), so the table's own count drives paging.
  let total = expected;
  for (let page = 1; page <= Math.ceil(total / 100); page++) {
    const args = { module: "schwabETFHoldingsTable", moduleArgs: { ModuleID: "holdingsTableContainer", symbol: ticker, wsodissue: issue, sortDir: "desc", sortBy: "PctNetAssets", page, numRows: 100 } };
    const body = new URLSearchParams({ inputs: "B64ENC" + Buffer.from(JSON.stringify(args)).toString("base64"), "..contenttype..": "text/javascript", "..requester..": "ContentBuffer" });
    const response = await axios.post(`https://www.schwab.wallst.com/schwab/Prospect/research/resources/server/Module/SchwabETF.ModuleAPI.asp?${session}`, body.toString(), { headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000, maxContentLength: 5_000_000 });
    const raw = String(response.data);
    if (!/^this\.apiReturn\s*=/.test(raw)) throw new Error("Schwab research response format changed");
    const root: ResearchNode = JSON.parse(raw.replace(/^this\.apiReturn\s*=\s*/, "").replace(/;\s*$/, "")).module;
    const range = load(`<div>${researchText(root)}</div>`).text().replace(/\s+/g, " ").match(/Viewing\s+(\d+)\s*-\s*(\d+)\s+of\s+([\d,]+)\s*matches/i);
    const tbody = researchFind(root, node => node.a?.id === "tthHoldingsTbody");
    const reported = Number(range?.[3].replace(/,/g, ""));
    if (page === 1 && reported >= expected && reported <= expected + Math.max(5, Math.ceil(expected * 0.005))) total = reported;
    if (!range || reported !== total || Number(range[1]) !== (page - 1) * 100 + 1 || !tbody) throw new Error(`Schwab research pagination mismatch: expected ${expected}, reported ${range?.[3] || "missing"} positions`);
    const rows = (tbody.c || []).filter((node): node is ResearchNode => typeof node === "object" && node.t === "tr");
    if (rows.length !== Number(range[2]) - Number(range[1]) + 1) throw new Error("Schwab research holdings count mismatch");
    for (const row of rows) {
      const cells = (row.c || []).filter((node): node is ResearchNode => typeof node === "object" && node.t === "td");
      if (cells.length < 3) throw new Error("Schwab research position fields are missing");
      const ticker = String(cells[0].a?.tsraw || ""), name = String(cells[1].a?.tsraw || "");
      holdings.push({ ticker, name, weight: numericWeight(cells[2].a?.tsraw), category: classify(name, "", ticker) });
    }
  }
  // A handful of repeated lines (cash, futures) is legitimate; a repeated page would add 100+ and also break the weight total.
  const duplicates = holdings.length - new Set(holdings.map(row => `${row.ticker}|${row.name}`)).size;
  if (holdings.length !== total || duplicates > 5) throw new Error(`Schwab research portfolio is incomplete or duplicated (${holdings.length} of ${total} positions, ${duplicates} repeated)`);
  return validatePortfolio({ etf: ticker, holdings, fetchedAt: new Date().toISOString(), sourceAsOf: date, source: "research", sourceName: "Schwab Research", sourceUrl: url, isFallback: false, weightMethod: "published",
    sourceWarning: `Direct issuer source failed (${primaryError}). Using Schwab's free dated research feed.`,
    coverageNote: "All pages of Schwab's public research holdings table, verified against its total position count. The date is the research feed's reported portfolio date; weights use its published precision. Derivatives are weights, not economic exposure." });
}
/**
 * Downloads the latest issuer portfolio. `notBefore` is the date of the portfolio already held:
 * if the issuer's primary file is older (stale CDN copy), the issuer's alternate export is tried.
 */
export async function fetchIssuerPortfolio(ticker: string, notBefore?: string): Promise<EtfData> {
  const upper = ticker.trim().toUpperCase();
  if (!sources[upper] && upper !== "GLDW") {
    try { return await fetchSecPortfolio(upper); }
    catch (error) { throw new Error(`No free daily issuer source is mapped for ${upper}, and the SEC N-PORT fallback failed: ${error instanceof Error ? error.message : error}`); }
  }
  try {
    const primary = await fetchPrimaryPortfolio(upper);
    if (!notBefore || primary.sourceAsOf! >= notBefore || !sources[upper]?.altUrl) return primary;
    try {
      const alternate = await fetchPrimaryPortfolio(upper, true);
      return alternate.sourceAsOf! > primary.sourceAsOf! ? alternate : primary;
    } catch (error) { console.warn(`${upper}: alternate iShares export failed (${error instanceof Error ? error.message : error})`); return primary; }
  }
  catch (error) {
    if (sources[upper]?.format !== "schwab") throw error;
    return fetchSchwabResearch(upper, error instanceof Error ? error.message : String(error));
  }
}
