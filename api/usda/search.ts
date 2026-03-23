import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { query } = req.query as Record<string, string>;
  const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";

  try {
    const response = await axios.post(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
      { query, dataType: ["Branded"], pageSize: 5 }
    );
    res.status(200).json(response.data);
  } catch (err: any) {
    console.error("USDA error:", err.message);
    res.status(500).json({ error: "Failed to fetch from USDA" });
  }
}
