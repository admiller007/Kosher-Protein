import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AGENCY_METADATA } from "./_lib";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(AGENCY_METADATA);
}
