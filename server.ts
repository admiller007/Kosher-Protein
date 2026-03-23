import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API proxy for OU Kosher
  app.get("/api/products", async (req, res) => {
    try {
      const { query = "protein", page = "1", limit = "50" } = req.query;
      
      console.log(`Fetching products for query: "${query}", page: ${page}`);

      const response = await axios.get("https://product-search.oukosher.org/api/v1/product", {
        params: { page, limit, query },
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9,he;q=0.8,de;q=0.7,es;q=0.6',
          'cache-control': 'no-cache',
          'origin': 'https://oukosher.org',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'referer': 'https://oukosher.org/',
          'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'
        }
      });
      
      console.log(`API Response status: ${response.status}`);
      // Log a snippet of the data to see the structure
      const dataStr = JSON.stringify(response.data);
      console.log(`API Response data length: ${dataStr.length}`);
      
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching from OU Kosher:", error.response?.status, error.message);
      if (error.response?.data) {
        console.error("Error data:", JSON.stringify(error.response.data));
      }
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch products",
        details: error.message 
      });
    }
  });

  // API proxy for USDA FoodData Central
  app.get("/api/usda/search", async (req, res) => {
    try {
      const { query } = req.query;
      const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
      
      const response = await axios.post(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
        {
          query,
          dataType: ["Branded"],
          pageSize: 5
        }
      );
      
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching from USDA:", error.message);
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
