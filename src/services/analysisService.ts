import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ProductAnalysis {
  productName: string;
  priceEstimate: number; // USD
  proteinGrams: number; // per serving
  servingsPerContainer: number;
  bangForBuck: number; // Price per gram of protein
  sourceUrl?: string;
  isUSDA?: boolean;
}

async function fetchUSDAData(query: string): Promise<{ proteinGrams: number; servingsPerContainer: number } | null> {
  try {
    const response = await fetch(`/api/usda/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      const proteinNutrient = food.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('protein'));
      const servings = food.servingSize || 1; // Fallback to 1 if not found
      
      if (proteinNutrient) {
        return {
          proteinGrams: proteinNutrient.value,
          servingsPerContainer: food.householdServingFullText ? 1 : 1 // This is tricky, usually FDC is per 100g or per serving
        };
      }
    }
    return null;
  } catch (error) {
    console.error("USDA fetch error:", error);
    return null;
  }
}

export async function analyzeProduct(productName: string, brandName: string): Promise<ProductAnalysis | null> {
  try {
    // Try USDA first for protein
    const usdaData = await fetchUSDAData(`${brandName} ${productName}`);
    
    const prompt = `Research and provide the average current price (USD), protein content (grams per serving), and total servings per container for the product: "${productName}" by "${brandName}". 
    Focus on finding the most common retail price (e.g., from Amazon, Walmart, or Target).
    ${usdaData ? `Note: USDA data suggests ${usdaData.proteinGrams}g of protein. Verify this and find the price.` : ""}
    
    Return the data in the following JSON format:
    {
      "priceEstimate": number,
      "proteinGrams": number,
      "servingsPerContainer": number,
      "sourceUrl": "string"
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) return null;

    const data = JSON.parse(text);
    
    // Use USDA data if available and Gemini data seems off, or just combine them
    const proteinGrams = usdaData?.proteinGrams || data.proteinGrams;
    const servingsPerContainer = data.servingsPerContainer || 1;
    
    // Calculate bang for buck: Total Price / (Protein per serving * Total servings)
    const totalProtein = proteinGrams * servingsPerContainer;
    const bangForBuck = totalProtein > 0 ? data.priceEstimate / totalProtein : 0;

    return {
      productName,
      priceEstimate: data.priceEstimate,
      proteinGrams: proteinGrams,
      servingsPerContainer: servingsPerContainer,
      bangForBuck: parseFloat(bangForBuck.toFixed(4)),
      sourceUrl: data.sourceUrl,
      isUSDA: !!usdaData
    };
  } catch (error) {
    console.error("Analysis error for product:", productName, error);
    return null;
  }
}
