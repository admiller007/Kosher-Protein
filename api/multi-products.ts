import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AGENCY_FETCHERS } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const {
    query = "protein",
    page = "1",
    limit = "50",
    agencies = "ou",
  } = req.query as Record<string, string>;

  const agencyKeys = agencies
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a in AGENCY_FETCHERS);

  if (agencyKeys.length === 0) {
    return res.status(400).json({ error: "No valid agencies specified" });
  }

  const settled = await Promise.allSettled(
    agencyKeys.map((key) =>
      AGENCY_FETCHERS[key](query, Number(page), Number(limit))
    )
  );

  const allResults: any[] = [];
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

  res.status(200).json({ results: allResults, total, errors });
}
