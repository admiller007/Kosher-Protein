export const config = { runtime: "edge" };

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const HEADERS = { "user-agent": UA, accept: "application/json, text/html, */*;q=0.8", "accept-language": "en-US,en;q=0.9" };

async function probe(label: string, url: string) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    const text = await res.text();
    const snippet = text.slice(0, 250).replace(/\s+/g, " ").trim();
    return { label, status: res.status, finalUrl: res.url, snippet };
  } catch (e: any) {
    return { label, status: "ERR", finalUrl: url, snippet: e.message };
  }
}

export default async function handler(): Promise<Response> {
  const q = "protein";
  const results = await Promise.all([
    probe("1. www root",              "https://www.ok.org/"),
    probe("2. product-search/",       "https://www.ok.org/product-search/"),
    probe("3. ?s= search",            `https://www.ok.org/?s=${q}`),
    probe("4. wp-json root",          "https://www.ok.org/wp-json/"),
    probe("5. WP ok_product type",    `https://www.ok.org/wp-json/wp/v2/ok_product?search=${q}&per_page=5`),
    probe("6. WP search endpoint",    `https://www.ok.org/wp-json/wp/v2/search?search=${q}&per_page=5`),
    probe("7. WP posts endpoint",     `https://www.ok.org/wp-json/wp/v2/posts?search=${q}&per_page=5`),
    probe("8. WP product type",       `https://www.ok.org/wp-json/wp/v2/product?search=${q}&per_page=5`),
    probe("9. ?rest_route search",    `https://www.ok.org/?rest_route=/wp/v2/search&search=${q}`),
    probe("10. no-www root",          "https://ok.org/"),
  ]);

  const color = (s: any) => s === 200 ? "green" : (s === 301 || s === 302) ? "orange" : "red";
  const rows = results.map(r =>
    `<tr>
      <td>${r.label}</td>
      <td style="font-weight:bold;color:${color(r.status)}">${r.status}</td>
      <td style="font-size:10px;word-break:break-all">${r.finalUrl}</td>
      <td style="font-size:10px">${(r.snippet || "").slice(0, 150)}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:monospace;padding:8px;font-size:13px;background:#111;color:#eee}
  h2{font-size:15px;margin-bottom:8px}
  table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #444;padding:5px;vertical-align:top}
  th{background:#333;color:#fff}
</style></head><body>
<h2>OK Kosher URL Probe (from Vercel Edge)</h2>
<table>
  <tr><th>Test</th><th>HTTP</th><th>Final URL</th><th>Body (150 chars)</th></tr>
  ${rows}
</table>
<details style="margin-top:12px"><summary>Full JSON</summary>
<pre style="font-size:10px;overflow:auto;background:#222;padding:8px">${JSON.stringify(results, null, 2)}</pre>
</details>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
