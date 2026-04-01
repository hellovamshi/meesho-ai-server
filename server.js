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
      Analyze the provided product image and generate a list of optimal fields for an online listing.
      You MUST return your response as a pure, valid JSON object. Do NOT wrap it in markdown blockquotes like \`\`\`json.
      
      Required fields in the JSON output:
      - "TITLE": A catchy, SEO-friendly product native title (up to 60 chars)
      - "DESCRIPTION": A detailed description highlighting features
      - "PRICE": An estimated reasonable price for this product in INR (numbers only, e.g. 299)
      - "CATEGORY": Best matching category (e.g. "Kurtis", "Kitchen Tools")
      - "BRAND": Detect brand if visible or leave as "Generic"
      
      Output strictly the RAW JSON dictionary object.
    `;

    // Initialize the model
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    // Call Gemini
    const result = await model.generateContent([
        prompt, 
        { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);

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
