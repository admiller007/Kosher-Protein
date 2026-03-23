export const config = { runtime: "edge" };

const AGENCY_METADATA: Record<string, { name: string; symbol: string }> = {
  ou:      { name: "OU Kosher", symbol: "OU"     },
  ok:      { name: "OK Kosher", symbol: "OK"     },
  "star-k":{ name: "Star-K",   symbol: "Star-K" },
  "kof-k": { name: "KOF-K",    symbol: "KF"     },
  crc:     { name: "CRC",      symbol: "cRc"    },
};

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

// ─── OU Kosher (Edge-compatible) ─────────────────────────────────────────────

async function fetchOU(query: string, page: string, limit: string) {
  const apiUrl = new URL("https://product-search.oukosher.org/api/v1/product");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("page", page);
  apiUrl.searchParams.set("limit", limit);

  const res = await fetch(apiUrl.toString(), {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,he;q=0.8,de;q=0.7,es;q=0.6",
      "cache-control": "no-cache",
      origin: "https://oukosher.org",
      pragma: "no-cache",
      referer: "https://oukosher.org/",
      "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    },
  });

  if (!res.ok) throw new Error(`OU API returned HTTP ${res.status}`);
  const data: any = await res.json();
  return {
    results: (data.results || []).map((p: any) => ({ ...p, source: "ou", agencyName: "OU Kosher" })),
    total: data.total || 0,
  };
}

// ─── Generic HTML scraper (basic text extraction, no cheerio) ────────────────

function scrapeTableRows(html: string, source: string, symbol: string, agencyName: string, query: string, limit: number) {
  const results: any[] = [];
  // Match <tr>…</tr> blocks (non-greedy)
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  let idx = 0;
  for (const row of rowMatches.slice(1)) { // skip header row
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(
      (td) => td.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim()
    );
    if (cells.length < 1 || !cells[0]) continue;
    const productName = cells[0];
    const company = cells[1] || "";
    const category = cells[2] || "General";
    if (productName.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        agencyUniqueId: `${source}-${idx++}-${Date.now()}`,
        productName,
        company: company || `See ${agencyName}`,
        brandName: company,
        dpm: cells[3] || "Pareve",
        symbol,
        category,
        certifiedSince: "",
        source,
        agencyName,
      });
    }
    if (results.length >= limit) break;
  }
  return results;
}

async function fetchOK(query: string, page: string, limit: string) {
  const url = new URL("https://www.ok.org/product-search/");
  url.searchParams.set("s", query);
  url.searchParams.set("paged", page);
  const res = await fetch(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      referer: "https://www.ok.org/",
    },
  });
  if (!res.ok) throw new Error(`OK HTTP ${res.status}`);
  const html = await res.text();
  return { results: scrapeTableRows(html, "ok", "OK", "OK Kosher", query, Number(limit)), total: 0 };
}

async function fetchStarK(query: string, page: string, limit: string) {
  const url = new URL("https://www.star-k.org/cons_products.php");
  url.searchParams.set("search", query);
  url.searchParams.set("pg", page);
  const res = await fetch(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      referer: "https://www.star-k.org/",
    },
  });
  if (!res.ok) throw new Error(`Star-K HTTP ${res.status}`);
  const html = await res.text();
  return { results: scrapeTableRows(html, "star-k", "Star-K", "Star-K", query, Number(limit)), total: 0 };
}

async function fetchKofK(query: string, page: string, limit: string) {
  const url = new URL("https://www.kof-k.org/Consumers/ProductSearch.aspx");
  url.searchParams.set("ProductName", query);
  url.searchParams.set("Page", page);
  const res = await fetch(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      referer: "https://www.kof-k.org/",
    },
  });
  if (!res.ok) throw new Error(`KOF-K HTTP ${res.status}`);
  const html = await res.text();
  return { results: scrapeTableRows(html, "kof-k", "KF", "KOF-K", query, Number(limit)), total: 0 };
}

async function fetchCRC(query: string, page: string, limit: string) {
  const url = new URL("https://consumer.crckosher.org/");
  url.searchParams.set("s", query);
  url.searchParams.set("paged", page);
  const res = await fetch(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      referer: "https://consumer.crckosher.org/",
    },
  });
  if (!res.ok) throw new Error(`CRC HTTP ${res.status}`);
  const html = await res.text();
  return { results: scrapeTableRows(html, "crc", "cRc", "CRC", query, Number(limit)), total: 0 };
}

const FETCHERS: Record<string, (q: string, p: string, l: string) => Promise<{ results: any[]; total: number }>> = {
  ou:      fetchOU,
  ok:      fetchOK,
  "star-k":fetchStarK,
  "kof-k": fetchKofK,
  crc:     fetchCRC,
};

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query   = url.searchParams.get("query")   || "protein";
  const page    = url.searchParams.get("page")    || "1";
  const limit   = url.searchParams.get("limit")   || "50";
  const agenciesParam = url.searchParams.get("agencies") || "ou";

  const keys = agenciesParam
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a in FETCHERS);

  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "No valid agencies" }), { status: 400, headers: cors });
  }

  const settled = await Promise.allSettled(keys.map((k) => FETCHERS[k](query, page, limit)));

  const allResults: any[] = [];
  let total = 0;
  const errors: Record<string, string> = {};

  settled.forEach((outcome, i) => {
    const key = keys[i];
    if (outcome.status === "fulfilled") {
      allResults.push(...outcome.value.results);
      total += outcome.value.total || outcome.value.results.length;
    } else {
      errors[key] = outcome.reason?.message || "Unknown error";
    }
  });

  return new Response(JSON.stringify({ results: allResults, total, errors }), { headers: cors });
}
