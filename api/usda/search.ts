export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("query") || "";
  const apiKey = (globalThis as any).process?.env?.USDA_API_KEY || "DEMO_KEY";

  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, dataType: ["Branded"], pageSize: 5 }),
      }
    );
    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: cors });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "USDA fetch failed", details: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}
