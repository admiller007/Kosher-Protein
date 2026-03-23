/**
 * Local development Express server.
 * On Vercel, API routes are handled by the serverless functions in /api/*.
 */
import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fetchFromOU, AGENCY_FETCHERS, AGENCY_METADATA } from "./api/_lib";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Legacy OU-only endpoint (backward compat)
  app.get("/api/products", async (req, res) => {
    try {
      const { query = "protein", page = "1", limit = "50" } = req.query as Record<string, string>;
      console.log(`[OU] query="${query}" page=${page}`);
      const result = await fetchFromOU(query, Number(page), Number(limit));
      res.json({ results: result.results, total: result.total });
    } catch (error: any) {
      console.error("OU fetch error:", error.response?.status, error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch products",
        details: error.message,
      });
    }
  });

  // Multi-agency endpoint
  app.get("/api/multi-products", async (req, res) => {
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

    console.log(`[multi] query="${query}" agencies=[${agencyKeys.join(",")}] page=${page}`);

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
        console.error(`[${key}] fetch failed:`, (outcome.reason as any)?.message);
        errors[key] = (outcome.reason as any)?.message || "Unknown error";
      }
    });

    res.json({ results: allResults, total, errors });
  });

  // Agency metadata endpoint
  app.get("/api/agencies", (_req, res) => {
    res.json(AGENCY_METADATA);
  });

  // USDA FoodData Central proxy
  app.get("/api/usda/search", async (req, res) => {
    try {
      const { query } = req.query as Record<string, string>;
      const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
      const response = await axios.post(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
        { query, dataType: ["Branded"], pageSize: 5 }
      );
      res.json(response.data);
    } catch (error: any) {
      console.error("USDA error:", error.message);
      res.status(500).json({ error: "Failed to fetch from USDA" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
