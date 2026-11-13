import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Domino AI Gemini Backend"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.post("/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({
        error: "imageBase64 and mimeType are required"
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const prompt = `
You are a visual Domino game assistant.

Analyze the provided Domino game screenshot.

Identify:
1. The player's hand tiles.
2. The tiles already placed on the table.
3. The open ends of the domino chain.
4. Any visible opponent tiles, only if clearly identifiable.

A tile must be represented as two numbers, for example [3, 5].

Do not guess unreadable tiles.
Return valid JSON only, using this structure:

{
  "hand": [],
  "board": [],
  "opponent": [],
  "leftEnd": null,
  "rightEnd": null,
  "confidence": 0,
  "notes": ""
}

Use arrays of objects for identified tiles:
{"a": 3, "b": 5}

If something is uncertain, explain it in notes.
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ]);

    const response = result.response.text();

    let data;
    try {
      data = JSON.parse(response);
    } catch {
      return res.status(502).json({
        error: "Gemini returned invalid JSON",
        raw: response
      });
    }

    res.json(data);

  } catch (error) {
    console.error("Analysis error:", error);

    res.status(500).json({
      error: "Image analysis failed"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Domino AI server running on port ${PORT}`);
});
