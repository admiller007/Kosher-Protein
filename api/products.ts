export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("query") || "protein";
  const page = url.searchParams.get("page") || "1";
  const limit = url.searchParams.get("limit") || "50";

  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  try {
    const apiUrl = new URL("https://product-search.oukosher.org/api/v1/product");
    apiUrl.searchParams.set("query", query);
    apiUrl.searchParams.set("page", page);
    apiUrl.searchParams.set("limit", limit);

    const response = await fetch(apiUrl.toString(), {
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

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "OU API error", details: `HTTP ${response.status} from OU API` }),
        { status: 502, headers: cors }
      );
    }

    const data: any = await response.json();
    const results = (data.results || []).map((p: any) => ({
      ...p,
      source: "ou",
      agencyName: "OU Kosher",
    }));

    return new Response(JSON.stringify({ results, total: data.total || 0 }), { headers: cors });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch from OU", details: err.message }),
      { status: 500, headers: cors }
    );
  }
}
