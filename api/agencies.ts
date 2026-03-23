export const config = { runtime: "edge" };

const AGENCY_METADATA = [
  { key: "ou",     name: "OU Kosher", symbol: "OU",     color: "#1a4d2e" },
  { key: "ok",     name: "OK Kosher", symbol: "OK",     color: "#0057a8" },
  { key: "star-k", name: "Star-K",    symbol: "Star-K", color: "#c8102e" },
  { key: "kof-k",  name: "KOF-K",     symbol: "KF",     color: "#f5821f" },
  { key: "crc",    name: "CRC",       symbol: "cRc",    color: "#6b21a8" },
];

export default function handler(): Response {
  return new Response(JSON.stringify(AGENCY_METADATA), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
