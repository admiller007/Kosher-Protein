export const config = { runtime: "edge" };

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function probe(label: string, url: string, extraHeaders: Record<string,string> = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
      redirect: "follow",
    });
    const text = await res.text();
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    return { label, status: res.status, finalUrl: res.url, snippet };
  } catch (e: any) {
    return { label, status: "ERR", finalUrl: url, snippet: e.message };
  }
}

export default async function handler(): Promise<Response> {
  const results = await Promise.all([
    probe("1. www root",         "https://www.ok.org/"),
    probe("2. product-search/",  "https://www.ok.org/product-search/"),
    probe("3. ?s=protein",       "https://www.ok.org/product-search/?s=protein"),
    probe("4. ?q=protein",       "https://www.ok.org/product-search/?q=protein"),
    probe("5. wp root search",   "https://www.ok.org/?s=protein"),
    probe("6. wp-json/",         "https://www.ok.org/wp-json/"),
    probe("7. wp-json v2 posts", "https://www.ok.org/wp-json/wp/v2/posts?search=protein&per_page=5"),
    probe("8. wp-json search",   "https://www.ok.org/wp-json/wp/v2/search?search=protein&per_page=5"),
    probe("9. no-www",           "https://ok.org/product-search/"),
    probe("10. consumer page",   "https://www.ok.org/consumer-learning-center/"),
  ]);

  const rows = results.map(r =>
    `<tr>
      <td>${r.label}</td>
      <td style="font-weight:bold;color:${r.status===200?'green':r.status===301||r.status===302?'orange':'red'}">${r.status}</td>
      <td style="font-size:11px;word-break:break-all">${r.finalUrl}</td>
      <td style="font-size:11px;max-width:200px;overflow:hidden">${(r.snippet||'').slice(0,120)}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:monospace;padding:8px;font-size:13px}table{border-collapse:collapse;width:100%}
td{border:1px solid #ccc;padding:4px;vertical-align:top}th{background:#222;color:#fff;padding:6px}</style>
</head><body>
<h2 style="font-size:16px">OK Kosher URL Probe</h2>
<table><tr><th>Test</th><th>HTTP</th><th>Final URL</th><th>Body snippet</th></tr>
${rows}
</table>
<pre style="margin-top:16px;font-size:11px;overflow:auto">${JSON.stringify(results,null,2)}</pre>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
