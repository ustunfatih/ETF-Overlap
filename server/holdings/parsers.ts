import { inflateRawSync } from "node:zlib";
import { load } from "cheerio";
import type { AssetCategory, EtfData, HoldingRow } from "@shared/schema";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Incomplete CSV response");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

// Only decompress the two worksheet XML files required from the issuer's XLSX.
export function parseXlsx(buffer: Buffer): string[][] {
  if (buffer.length < 22) throw new Error("Invalid XLSX archive");
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error("Invalid XLSX archive");
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid XLSX directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === "xl/sharedStrings.xml" || name === "xl/worksheets/sheet1.xml") {
      if (size > 20_000_000) throw new Error("XLSX worksheet is too large");
      const local = buffer.readUInt32LE(offset + 42);
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const bytes = buffer.subarray(start, start + compressed);
      if (method !== 0 && method !== 8) throw new Error("Unsupported XLSX compression");
      entries.set(name, (method === 8 ? inflateRawSync(bytes, { maxOutputLength: 20_000_000 }) : bytes).toString());
    }
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  const strings = load(entries.get("xl/sharedStrings.xml") || "<sst/>", { xmlMode: true });
  const shared = strings("si").map((_, element) => strings(element).text()).get();
  const xml = entries.get("xl/worksheets/sheet1.xml");
  if (!xml) throw new Error("XLSX worksheet is missing");
  const sheet = load(xml, { xmlMode: true });
  return sheet("row").toArray().map(element => {
    const row: string[] = [];
    sheet(element).find("c").each((_, c) => {
      const cell = sheet(c), letters = (cell.attr("r") || "").replace(/\d/g, "");
      let column = 0;
      for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
      const value = cell.find("v").text();
      row[column - 1] = cell.attr("t") === "s" ? shared[Number(value)] : cell.attr("t") === "inlineStr" ? cell.find("t").text() : value;
    });
    return row;
  });
}

export function portfolioDate(value: unknown): string {
  const raw = String(value ?? "").replace(/^As of\s*/i, "").trim();
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const normalized = us ? `${us[3].length === 2 ? "20" : ""}${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : raw;
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00:00Z` : `${normalized} 00:00:00 GMT`);
  if (!raw || !Number.isFinite(time)) throw new Error("Portfolio date is missing or invalid");
  const date = new Date(time).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && date !== normalized) throw new Error("Invalid portfolio calendar date");
  if (date > new Date().toISOString().slice(0, 10)) throw new Error("Portfolio date is in the future");
  return date;
}

export function numericWeight(value: unknown): number {
  if (value === undefined || value === null || String(value).trim() === "") throw new Error("Position weight is missing");
  const parsed = Number(String(value).replace(/[%,$\s]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Invalid position weight: ${value}`);
  return parsed;
}

export function classify(name: string, type = "", ticker = ""): AssetCategory {
  const value = `${type} ${name} ${ticker}`.toUpperCase();
  if (type.toUpperCase() === "EQUITY" || /COMMON STOCK|^REIT$/.test(type.toUpperCase())) return /CVR|CONTINGENT|RESTRICT|VESTING|RIGHTS/.test(name.toUpperCase()) ? "other" : "equity";
  if (/REPO|REPURCHASE/.test(value)) return "repo";
  if (/DEPOSIT/.test(type.toUpperCase()) || /CERTIFICATE OF DEPOSIT|TIME DEPOSIT|CASH DEPOSIT/.test(value)) return "deposit";
  if (/FUTURE|\bFUT\b|E[ -]?MINI|MINI E.CBOT|SWAP|DERIVATIVE|DE\.IND|CT\.PORTSWAP|EQUITY.LINKED|STRUCTURED NOTE|\bELN\b/.test(value)) return "derivative";
  if (/OPTION/.test(type.toUpperCase()) || /\d{6}[CP]\d{8}|(?:^|\s)[CP]\d{3,}/.test(value)) return "option";
  if (/CASH|CURRENCY|CRNY|GOVERNMENT MM|MONEY MARKET|MONEY MK(T|T)|MM\.CASH|CASH&OTHER|US DOLLAR|POUND STERLING|EURO CURRENCY|PENDING DIVIDENDS/.test(value)) return "cash";
  if (/CVR|CONTINGENT|RESTRICT|VESTING|RIGHTS/.test(value)) return "other";
  if (/FIXED INCOME|BOND|TREASURY|TREAS\. BILL|GOVERNMENT|CORPORATE DEBT/.test(value)) return "bond";
  if (/OTHER|COMMODITY/.test(type.toUpperCase())) return "other";
  return "equity";
}

export function validatePortfolio(data: EtfData): EtfData {
  data.sourceAsOf = portfolioDate(data.sourceAsOf);
  if (!data.holdings.length) throw new Error("Empty portfolio response");
  const categories: Partial<Record<AssetCategory, number>> = {};
  const positions = new Map<string, HoldingRow>();
  for (const [index, holding] of data.holdings.entries()) {
    if (!holding.name || !Number.isFinite(holding.weight) || Math.abs(holding.weight) > 100) throw new Error("Invalid portfolio position");
    const category = holding.category || "equity";
    if (!["equity", "cash", "deposit", "repo", "bond", "option", "derivative", "other"].includes(category)) throw new Error("Invalid asset category");
    if (category === "equity" && !holding.ticker) throw new Error("Equity position has no symbol");
    // US share-class punctuation varies between issuers (BRK/B, BRK-B, BRK.B).
    const ticker = holding.ticker.trim().toUpperCase().replace(/^([A-Z]+)[/-]([AB])$/, "$1.$2");
    const key = `${category}:${category === "equity" ? holding.securityId || ticker : holding.securityId || `${holding.name}:${index}`}`;
    const previous = positions.get(key);
    positions.set(key, { ...holding, ticker, category, weight: (previous?.weight || 0) + holding.weight });
    categories[category] = (categories[category] || 0) + holding.weight;
  }
  const total = Object.values(categories).reduce((sum, weight) => sum + (weight || 0), 0);
  if (total < 97 || total > 103) throw new Error(`Portfolio weights total ${total.toFixed(2)}%; full coverage cannot be verified`);
  return { ...data, holdings: Array.from(positions.values()), holdingsCount: positions.size, coverageWeight: total, categoryWeights: categories, complete: true };
}
