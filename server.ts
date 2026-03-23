import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { load as cheerioLoad } from "cheerio";

// Normalized product shape returned by every agency fetcher
interface NormalizedProduct {
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
  source: string;       // agency key, e.g. "ou", "ok", "star-k"
  agencyName: string;   // human-readable label
}

interface AgencyResult {
  results: NormalizedProduct[];
  total: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function slug(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}`;
}

// ─── OU Kosher ───────────────────────────────────────────────────────────────

async function fetchFromOU(
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
// OK Kosher exposes a WordPress-backed product directory.
// Their AJAX search endpoint returns JSON product data.

async function fetchFromOK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  // Try the WP REST / AJAX search endpoint OK Kosher uses internally
  const response = await axios.get("https://www.ok.org/product-search/", {
    params: { s: query, paged: page },
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      referer: "https://www.ok.org/",
      "user-agent": BROWSER_UA,
    },
    timeout: 15000,
  });

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  // OK Kosher product cards: try several common selectors
  const selectors = [
    ".product-item",
    ".product-card",
    ".ok-product",
    "article.product",
    ".entry-product",
    ".search-result-item",
    ".product",
  ];

  let found = false;
  for (const sel of selectors) {
    $(sel).each((i, el) => {
      const $el = $(el);
      const productName =
        $el.find("h2, h3, h4, .product-title, .entry-title, .title").first().text().trim() ||
        $el.attr("data-name") || "";
      const company =
        $el.find(".company, .brand, .manufacturer, .company-name").first().text().trim() || "";
      const category =
        $el.find(".category, .product-category, .tag").first().text().trim() || "General";
      const dpm =
        $el.find(".dpm, .kosher-status, .ok-status").first().text().trim() || "Pareve";

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

  // Fallback: parse any <li> or table rows that look like product lines
  if (!found) {
    $("table tr").each((i, el) => {
      if (i === 0) return;
      const cells = $(el).find("td");
      if (cells.length < 1) return;
      const productName = $(cells[0]).text().trim();
      const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
      if (productName && productName.length < 200 &&
          productName.toLowerCase().includes(query.toLowerCase())) {
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
// Star-K provides a PHP-rendered product search page.

async function fetchFromStarK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get(
    "https://www.star-k.org/cons_products.php",
    {
      params: { search: query, pg: page },
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        referer: "https://www.star-k.org/",
        "user-agent": BROWSER_UA,
      },
      timeout: 15000,
    }
  );

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  // Star-K renders results in a table
  $("table tr").each((i, el) => {
    if (i === 0) return; // skip header
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

  // Fallback: try list-based layout
  if (products.length === 0) {
    $("ul.products li, .product-list li, .search-results li").each((i, el) => {
      const $el = $(el);
      const productName = $el.find("a, .name, strong").first().text().trim() || $el.text().trim();
      const company = $el.find(".company, .brand").first().text().trim();

      if (productName && productName.length < 300 &&
          productName.toLowerCase().includes(query.toLowerCase())) {
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
// KOF-K exposes an ASPX product search form.

async function fetchFromKofK(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get(
    "https://www.kof-k.org/Consumers/ProductSearch.aspx",
    {
      params: { ProductName: query, Page: page },
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  // KOF-K ASP.NET GridView typically renders as a table
  $("table tr").each((i, el) => {
    if (i === 0) return;
    const cells = $(el).find("td");
    if (cells.length < 1) return;

    const productName = $(cells[0]).text().trim();
    const company = cells.length > 1 ? $(cells[1]).text().trim() : "";
    const category = cells.length > 2 ? $(cells[2]).text().trim() : "General";

    if (productName && productName.length < 300 &&
        productName.toLowerCase().includes(query.toLowerCase())) {
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

// ─── CRC (Chicago Rabbinical Council) ────────────────────────────────────────

async function fetchFromCRC(
  query: string,
  page: number,
  limit: number
): Promise<AgencyResult> {
  const response = await axios.get("https://consumer.crckosher.org/", {
    params: { s: query, paged: page },
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      referer: "https://consumer.crckosher.org/",
      "user-agent": BROWSER_UA,
    },
    timeout: 15000,
  });

  const $ = cheerioLoad(response.data);
  const products: NormalizedProduct[] = [];

  // Try product cards first
  $(".product-item, .product-card, article, .entry, .result-item").each((i, el) => {
    const $el = $(el);
    const productName =
      $el.find("h2, h3, h4, .title, .product-name").first().text().trim() || "";
    const company =
      $el.find(".company, .brand, .manufacturer").first().text().trim() || "";
    const category =
      $el.find(".category, .tag").first().text().trim() || "General";

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

  // Fallback: table rows
  if (products.length === 0) {
    $("table tr").each((i, el) => {
      if (i === 0) return;
      const cells = $(el).find("td");
      if (cells.length < 1) return;
      const productName = $(cells[0]).text().trim();
      const company = cells.length > 1 ? $(cells[1]).text().trim() : "";

      if (productName && productName.length < 300 &&
          productName.toLowerCase().includes(query.toLowerCase())) {
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

// ─── Agency dispatch ─────────────────────────────────────────────────────────

const AGENCY_FETCHERS: Record<
  string,
  (q: string, page: number, limit: number) => Promise<AgencyResult>
> = {
  ou: fetchFromOU,
  ok: fetchFromOK,
  "star-k": fetchFromStarK,
  "kof-k": fetchFromKofK,
  crc: fetchFromCRC,
};

// ─── Express server ───────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Legacy single-agency endpoint (OU only) – kept for backward compat
  app.get("/api/products", async (req, res) => {
    try {
      const { query = "protein", page = "1", limit = "50" } = req.query;
      console.log(`[OU] Fetching "${query}", page ${page}`);
      const result = await fetchFromOU(String(query), Number(page), Number(limit));
      res.json({ results: result.results, total: result.total });
    } catch (error: any) {
      console.error("OU fetch error:", error.response?.status, error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch products",
        details: error.message,
      });
    }
  });

  // Multi-agency endpoint
  // GET /api/multi-products?query=protein&agencies=ou,ok,star-k&page=1&limit=50
  app.get("/api/multi-products", async (req, res) => {
    const {
      query = "protein",
      page = "1",
      limit = "50",
      agencies = "ou",
    } = req.query;

    const agencyKeys = String(agencies)
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a in AGENCY_FETCHERS);

    if (agencyKeys.length === 0) {
      return res.status(400).json({ error: "No valid agencies specified" });
    }

    console.log(
      `[multi] query="${query}" agencies=[${agencyKeys.join(",")}] page=${page}`
    );

    const settled = await Promise.allSettled(
      agencyKeys.map((key) =>
        AGENCY_FETCHERS[key](String(query), Number(page), Number(limit))
      )
    );

    const allResults: NormalizedProduct[] = [];
    let total = 0;
    const errors: Record<string, string> = {};

    settled.forEach((outcome, idx) => {
      const key = agencyKeys[idx];
      if (outcome.status === "fulfilled") {
        allResults.push(...outcome.value.results);
        total += outcome.value.total;
      } else {
        console.error(`[${key}] fetch failed:`, outcome.reason?.message);
        errors[key] = outcome.reason?.message || "Unknown error";
      }
    });

    res.json({ results: allResults, total, errors });
  });

  // Agencies metadata endpoint – lets the UI discover available agencies
  app.get("/api/agencies", (_req, res) => {
    res.json([
      { key: "ou",     name: "OU Kosher",  symbol: "OU",     color: "#1a4d2e" },
      { key: "ok",     name: "OK Kosher",  symbol: "OK",     color: "#0057a8" },
      { key: "star-k", name: "Star-K",     symbol: "Star-K", color: "#c8102e" },
      { key: "kof-k",  name: "KOF-K",      symbol: "KF",     color: "#f5821f" },
      { key: "crc",    name: "CRC",        symbol: "cRc",    color: "#6b21a8" },
    ]);
  });

  // API proxy for USDA FoodData Central
  app.get("/api/usda/search", async (req, res) => {
    try {
      const { query } = req.query;
      const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";

      const response = await axios.post(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
        { query, dataType: ["Branded"], pageSize: 5 }
      );

      res.json(response.data);
    } catch (error: any) {
      console.error("USDA error:", error.message);
      res.status(500).json({ error: "Failed to fetch from USDA" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
