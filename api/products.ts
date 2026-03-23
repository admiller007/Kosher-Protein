import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchFromOU } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const {
    query = "protein",
    page = "1",
    limit = "50",
  } = req.query as Record<string, string>;

  try {
    const result = await fetchFromOU(query, Number(page), Number(limit));
    res.status(200).json({ results: result.results, total: result.total });
  } catch (err: any) {
    console.error("OU fetch error:", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: "Failed to fetch products", details: err.message });
  }
}
