const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
// Set high limit for base64 image strings
app.use(express.json({ limit: '50mb' }));

// Setup Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Health check endpoint for Railway
app.get('/', (req, res) => {
  res.json({ status: "Meesho AI Backend is running!", version: "1.0" });
});

app.post('/analyze-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 string' });
    }

    let mimeType = 'image/jpeg';
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
        mimeType = mimeMatch[1];
    }

    // Process the base64 string
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    console.log("Image received, querying Gemini for " + mimeType + "...");

    const prompt = `
      You are an expert e-commerce catalog assistant for Meesho. 
      Analyze the provided product image and generate a comprehensive list of optimal fields for an online listing.
      You MUST return your response as a pure, valid structured JSON object. 
      Do NOT wrap it in markdown blockquotes like \`\`\`json.
      
      Required fields to guess/generate in the JSON dictionary (return as many as logically applicable):
      - "Product Name": A catchy, SEO-friendly product native title (up to 60 chars)
      - "Description": A detailed description highlighting features with bullet points
      - "Price": Estimated reasonable price in INR (numbers only)
      - "Category": Best matching category
      - "Brand": Detect brand if visible or leave as "Generic"
      - "Color": Primary color of the product
      - "Material": The main material
      - "Fabric": If clothing, what fabric?
      - "Pattern": Pattern style
      - "Net Weight (gms)": Estimate weight in grams (e.g. "200", "500")
      - "Size": E.g., "Free Size", "M", "L"
      - "GST": Estimate GST bracket (e.g., "5", "12", "18")
      - "HSN Code": Estimate 4-digit or 8-digit HSN code
      - "Product ID": Create a random 6 character alphanumeric Style code
      - "Generic Name": Simple generic name
      
      Output strictly the RAW JSON dictionary object with direct key-value string pairs.
    `;

    // Try multiple models to ensure it works regardless of the user's API key region/age
    const modelsToTry = [
        { name: "gemini-2.5-flash", config: { responseMimeType: "application/json" } },
        { name: "gemini-2.0-flash", config: { responseMimeType: "application/json" } },
        { name: "gemini-1.5-flash", config: { responseMimeType: "application/json" } }
    ];

    let result;
    let fallbackError;

    for (const modelDef of modelsToTry) {
        try {
            console.log("Trying model: " + modelDef.name);
            const model = genAI.getGenerativeModel({ 
                model: modelDef.name, 
                generationConfig: modelDef.config 
            });
            result = await model.generateContent([
                prompt, 
                { inlineData: { data: base64Data, mimeType: mimeType } }
            ]);
            break; // Success! Break out of the loop.
        } catch (err) {
            console.warn("Model " + modelDef.name + " failed:", err.message);
            fallbackError = err; // Save error and try the next one
        }
    }

    if (!result) {
        throw new Error("All Gemini models failed. Last error: " + (fallbackError ? fallbackError.message : "Unknown error"));
    }

    const aiText = result.response.text();
    console.log("Raw Gemini Output:", aiText);
    
    // Attempt to parse JSON safely
    let jsonResult;
    try {
      jsonResult = JSON.parse(aiText);
    } catch (parseError) {
      // In case the AI still included markdown, let's try to strip it
      const cleaned = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
      jsonResult = JSON.parse(cleaned);
    }

    return res.json(jsonResult);

  } catch (error) {
    console.error("Analysis Error:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Meesho AI Server is running on port ${PORT}`);
});
