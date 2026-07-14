// netlify/functions/coach-feedback.js
// Tries Gemini first, falls back to Groq (Llama 3.3 70B) if Gemini fails.
// Set GEMINI_API_KEY and GROQ_API_KEY in Netlify: Site settings -> Environment variables.

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

function buildPrompt(s) {
  const mistypes = Array.isArray(s.topMistypes) && s.topMistypes.length
    ? s.topMistypes.join(", ")
    : "none notable";

  return `You are a friendly, concise typing coach. A user just finished a typing test with these results:
- Mode: ${s.mode || "unknown"}, category: ${s.category || "unknown"}
- Net WPM: ${s.wpm ?? "n/a"}
- Accuracy: ${s.accuracy ?? "n/a"}%
- Consistency: ${s.consistency ?? "n/a"}%
- Mistakes: ${s.mistakes ?? "n/a"}
- Most mistyped characters: ${mistypes}

Write 2-3 short sentences of specific, encouraging, non-generic coaching feedback based on these exact numbers. Reference at least one concrete number. Suggest one specific, actionable next step. Plain text only, no markdown, no bullet points, no greeting.`;
}

async function tryGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const feedback = candidate?.content?.parts?.[0]?.text?.trim();
  if (!feedback) throw new Error(`Gemini returned no text (${candidate?.finishReason || "NO_TEXT"})`);

  return feedback;
}

async function tryGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 400
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const feedback = data?.choices?.[0]?.message?.content?.trim();
  if (!feedback) throw new Error("Groq returned no text");

  return feedback;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let s;
  try {
    s = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const prompt = buildPrompt(s);
  const errors = [];

  try {
    const feedback = await tryGemini(prompt);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback, provider: "gemini" }) };
  } catch (err) {
    errors.push(String(err.message || err));
  }

  try {
    const feedback = await tryGroq(prompt);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback, provider: "groq" }) };
  } catch (err) {
    errors.push(String(err.message || err));
  }

  return {
    statusCode: 502,
    body: JSON.stringify({ error: "Both providers failed", reason: "ALL_PROVIDERS_FAILED", detail: errors.join(" | ") })
  };
};
