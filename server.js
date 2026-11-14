
import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "15mb" }));

function checkToken(req) {
  const expected = process.env.ACCESS_TOKEN;
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!expected || !match) return false;

  const provided = Buffer.from(match[1].trim());
  const saved = Buffer.from(expected);

  return provided.length === saved.length &&
    crypto.timingSafeEqual(provided, saved);
}

function tiles(list) {
  if (!Array.isArray(list)) return [];

  return list.filter(t =>
    t &&
    Number.isInteger(Number(t.a)) &&
    Number.isInteger(Number(t.b)) &&
    Number(t.a) >= 0 && Number(t.a) <= 6 &&
    Number(t.b) >= 0 && Number(t.b) <= 6
  ).map(t => ({ a: Number(t.a), b: Number(t.b) }));
}

function endValue(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Domino AI Gemini Backend" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.post("/analyze", async (req, res) => {
  try {
    if (!process.env.ACCESS_TOKEN) {
      return res.status(503).json({
        ok: false,
        message: "ACCESS_TOKEN is not configured"
      });
    }

    if (!checkToken(req)) {
      return res.status(401).json({
        ok: false,
        message: "Invalid access token"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        message: "GEMINI_API_KEY is not configured"
      });
    }

    let imageBase64 =
      req.body?.image_base64 || req.body?.imageBase64;

    const mimeType =
      req.body?.mimeType ||
      req.body?.mime_type ||
      "image/jpeg";

    if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Image is required"
      });
    }

    imageBase64 = imageBase64.trim().replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/i,
      ""
    );

    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported image type"
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const prompt = `
Analyze this Domino game screenshot carefully.

Return JSON only:
{
  "hand": [],
  "board": [],
  "opponent": [],
  "leftEnd": null,
  "rightEnd": null,
  "confidence": 0,
  "notes": ""
}

Each tile must be:
{"a": 3, "b": 5}

Rules:
- Read only clearly visible tiles.
- Hand means the player's own tiles only.
- Board means tiles placed in the center.
- Opponent means opponent tiles only if clearly visible.
- Never guess unreadable tiles.
- leftEnd and rightEnd are the exposed values.
- Use null for uncertain ends.
- confidence is from 0 to 1.
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType
        }
      }
    ]);

    let data;

    try {
      data = JSON.parse(result.response.text());
    } catch {
      return res.status(502).json({
        ok: false,
        message: "Gemini returned invalid JSON"
      });
    }

    const hand = tiles(data.hand);
    const board = tiles(data.board);
    const opponent = tiles(data.opponent);

    const confidence = Math.max(
      0,
      Math.min(1, Number(data.confidence) || 0)
    );

    const left = endValue(data.leftEnd);
    const right = endValue(data.rightEnd);

    return res.json({
      ok: true,
      message: String(data.notes || "Analysis completed"),
      hand,
      board,
      opponent,
      left,
      right,
      verified: confidence >= 0.8 && hand.length > 0,
      recommendation: {
        valid: false,
        hand_index: -1,
        side: ""
      }
    });

  } catch (error) {
    console.error("Analysis error:", error);

    return res.status(500).json({
      ok: false,
      message: "Image analysis failed"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Domino AI server running on port " + PORT);
});
