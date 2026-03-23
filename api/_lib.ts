/**
 * Shared agency-fetching logic for both the local Express server and
 * Vercel serverless functions (files starting with _ are ignored by Vercel
 * as API routes but can be imported as utilities).
 */
import axios from "axios";
import { load as cheerioLoad } from "cheerio";

export interface NormalizedProduct {
  agencyUniqueId: string;
  productName: string;
  company: string;
  brandName: string;
  dpm: string;
  symbol: string;
  category: string;
  certifiedSince: string;
  location?: string;
  website?: string;
  source: string;
  agencyName: string;
}

export interface AgencyResult {
  results: NormalizedProduct[];
  total: number;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function slug(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}`;
}

// ─── OU Kosher ───────────────────────────────────────────────────────────────

export async function fetchFromOU(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get(
    "https://product-search.oukosher.org/api/v1/product",
    {
      params: { page, limit, query },
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,he;q=0.8,de;q=0.7,es;q=0.6",
        "cache-control": "no-cache",
        origin: "https://oukosher.org",
        pragma: "no-cache",
        priority: "u=1, i",
        referer: "https://oukosher.org/",
        "sec-ch-ua":
          '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
      },
    }
  );

  return {
    results: (response.data.results || []).map((p: any) => ({
      ...p,
      source: "ou",
      agencyName: "OU Kosher",
    })),
    total: response.data.total || 0,
  };
}

// ─── OK Kosher ───────────────────────────────────────────────────────────────

export async function fetchFromOK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get("https://www.ok.org/product-search/", {
    params: { s: query, paged: page },
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      referer: "https://www.ok.org/",
      "user-agent": BROWSER_UA,
    },
    timeout: 15000,
  });

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  const selectors = [
    ".product-item", ".product-card", ".ok-product",
    "article.product", ".entry-product", ".search-result-item", ".product",
  ];

  let found = false;
  for (const sel of selectors) {
    $(sel).each((i, el) => {
      const $el = $(el);
      const productName =
        $el.find("h2,h3,h4,.product-title,.entry-title,.title").first().text().trim() ||
        $el.attr("data-name") || "";
      const company =
        $el.find(".company,.brand,.manufacturer,.company-name").first().text().trim() || "";
      const category =
        $el.find(".category,.product-category,.tag").first().text().trim() || "General";
      const dpm =
        $el.find(".dpm,.kosher-status,.ok-status").first().text().trim() || "Pareve";

      if (productName) {
        found = true;
        products.push({
          agencyUniqueId: slug("ok", i),
          productName,
          company: company || "See OK Kosher",
          brandName: company,
          dpm,
          symbol: "OK",
          category,
          certifiedSince: "",
          source: "ok",
          agencyName: "OK Kosher",
        });
      }
    });
    if (found) break;
  }

  if (!found) {
    $("table tr").each((i, el) => {
      if (i === 0) return;
      const cells = $(el).find("td");
      if (cells.length < 1) return;
      const productName = $(cells[0]).text().trim();
      const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
      if (
        productName && productName.length < 200 &&
        productName.toLowerCase().includes(query.toLowerCase())
      ) {
        products.push({
          agencyUniqueId: slug("ok-tr", i),
          productName,
          company: company || "See OK Kosher",
          brandName: company,
          dpm: "Pareve",
          symbol: "OK",
          category: cells.length > 2 ? $(cells[2]).text().trim() : "General",
          certifiedSince: "",
          source: "ok",
          agencyName: "OK Kosher",
        });
      }
    });
  }

  return { results: products.slice(0, limit), total: products.length };
}

// ─── Star-K ──────────────────────────────────────────────────────────────────

export async function fetchFromStarK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get("https://www.star-k.org/cons_products.php", {
    params: { search: query, pg: page },
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      referer: "https://www.star-k.org/",
      "user-agent": BROWSER_UA,
    },
    timeout: 15000,
  });

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  $("table tr").each((i, el) => {
    if (i === 0) return;
    const cells = $(el).find("td");
    if (cells.length < 1) return;
    const productName = $(cells[0]).text().trim();
    const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
    const category = cells.length > 2 ? $(cells[2]).text().trim() : "General";
    const dpm = cells.length > 3 ? $(cells[3]).text().trim() : "Pareve";
    if (productName && productName.length < 300) {
      products.push({
        agencyUniqueId: slug("star-k", i),
        productName,
        company: company || "See Star-K",
        brandName: company,
        dpm,
        symbol: "Star-K",
        category,
        certifiedSince: "",
        source: "star-k",
        agencyName: "Star-K",
      });
    }
  });

  if (products.length === 0) {
    $("ul.products li,.product-list li,.search-results li").each((i, el) => {
      const $el = $(el);
      const productName =
        $el.find("a,.name,strong").first().text().trim() || $el.text().trim();
      const company = $el.find(".company,.brand").first().text().trim();
      if (
        productName && productName.length < 300 &&
        productName.toLowerCase().includes(query.toLowerCase())
      ) {
        products.push({
          agencyUniqueId: slug("star-k-li", i),
          productName,
          company: company || "See Star-K",
          brandName: company,
          dpm: "Pareve",
          symbol: "Star-K",
          category: "General",
          certifiedSince: "",
          source: "star-k",
          agencyName: "Star-K",
        });
      }
    });
  }

  return { results: products.slice(0, limit), total: products.length };
}

// ─── KOF-K ───────────────────────────────────────────────────────────────────

export async function fetchFromKofK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get(
    "https://www.kof-k.org/Consumers/ProductSearch.aspx",
    {
      params: { ProductName: query, Page: page },
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        referer: "https://www.kof-k.org/",
        "user-agent": BROWSER_UA,
      },
      timeout: 15000,
    }
  );

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  $("table tr").each((i, el) => {
    if (i === 0) return;
    const cells = $(el).find("td");
    if (cells.length < 1) return;
    const productName = $(cells[0]).text().trim();
    const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
    const category = cells.length > 2 ? $(cells[2]).text().trim() : "General";
    if (
      productName && productName.length < 300 &&
      productName.toLowerCase().includes(query.toLowerCase())
    ) {
      products.push({
        agencyUniqueId: slug("kof-k", i),
        productName,
        company: company || "See KOF-K",
        brandName: company,
        dpm: "Pareve",
        symbol: "KF",
        category,
        certifiedSince: "",
        source: "kof-k",
        agencyName: "KOF-K",
      });
    }
  });

  return { results: products.slice(0, limit), total: products.length };
}

// ─── CRC ─────────────────────────────────────────────────────────────────────

export async function fetchFromCRC(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get("https://consumer.crckosher.org/", {
    params: { s: query, paged: page },
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      referer: "https://consumer.crckosher.org/",
      "user-agent": BROWSER_UA,
    },
    timeout: 15000,
  });

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  $(".product-item,.product-card,article,.entry,.result-item").each((i, el) => {
    const $el = $(el);
    const productName =
      $el.find("h2,h3,h4,.title,.product-name").first().text().trim() || "";
    const company =
      $el.find(".company,.brand,.manufacturer").first().text().trim() || "";
    const category =
      $el.find(".category,.tag").first().text().trim() || "General";
    if (productName) {
      products.push({
        agencyUniqueId: slug("crc", i),
        productName,
        company: company || "See CRC",
        brandName: company,
        dpm: "Pareve",
        symbol: "cRc",
        category,
        certifiedSince: "",
        source: "crc",
        agencyName: "CRC",
      });
    }
  });

  if (products.length === 0) {
    $("table tr").each((i, el) => {
      if (i === 0) return;
      const cells = $(el).find("td");
      if (cells.length < 1) return;
      const productName = $(cells[0]).text().trim();
      const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
      if (
        productName && productName.length < 300 &&
        productName.toLowerCase().includes(query.toLowerCase())
      ) {
        products.push({
          agencyUniqueId: slug("crc-tr", i),
          productName,
          company: company || "See CRC",
          brandName: company,
          dpm: "Pareve",
          symbol: "cRc",
          category: cells.length > 2 ? $(cells[2]).text().trim() : "General",
          certifiedSince: "",
          source: "crc",
          agencyName: "CRC",
        });
      }
    });
  }

  return { results: products.slice(0, limit), total: products.length };
}

// ─── Dispatch table ───────────────────────────────────────────────────────────

export const AGENCY_FETCHERS: Record<
  string,
  (q: string, page: number, limit: number) => Promise<AgencyResult>
> = {
  ou: fetchFromOU,
  ok: fetchFromOK,
  "star-k": fetchFromStarK,
  "kof-k": fetchFromKofK,
  crc: fetchFromCRC,
};

export const AGENCY_METADATA = [
  { key: "ou",     name: "OU Kosher", symbol: "OU",     color: "#1a4d2e" },
  { key: "ok",     name: "OK Kosher", symbol: "OK",     color: "#0057a8" },
  { key: "star-k", name: "Star-K",    symbol: "Star-K", color: "#c8102e" },
  { key: "kof-k",  name: "KOF-K",     symbol: "KF",     color: "#f5821f" },
  { key: "crc",    name: "CRC",       symbol: "cRc",    color: "#6b21a8" },
];
