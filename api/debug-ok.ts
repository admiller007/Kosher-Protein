export const config = { runtime: "edge" };

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function probe(label: string, url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        ...(init?.headers as Record<string, string> || {}),
      },
      redirect: "follow",
    });
    const text = await res.text();
    return {
      label,
      url,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      bodySnippet: text.slice(0, 400).replace(/\s+/g, " "),
    };
  } catch (e: any) {
    return { label, url, error: e.message };
  }
}

export default async function handler(): Promise<Response> {
  const results = await Promise.all([
    probe("root-www",       "https://www.ok.org/"),
    probe("root-no-www",    "https://ok.org/"),
    probe("product-search", "https://www.ok.org/product-search/"),
    probe("search-s-param", "https://www.ok.org/product-search/?s=protein"),
    probe("search-q-param", "https://www.ok.org/product-search/?q=protein"),
    probe("wp-json-root",   "https://www.ok.org/wp-json/"),
    probe("wp-json-posts",  "https://www.ok.org/wp-json/wp/v2/posts?search=protein"),
    probe("wp-rest-search", "https://www.ok.org/wp-json/wp/v2/search?search=protein&type=post"),
    probe("admin-ajax",     "https://www.ok.org/wp-admin/admin-ajax.php?action=product_search&query=protein", {
      method: "GET",
    }),
    probe("products-page",  "https://www.ok.org/products/"),
    probe("consumer-search","https://www.ok.org/consumer-learning-center/?s=protein"),
  ]);

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
