// netlify/functions/generate-passage.js
// Tries Gemini first, falls back to Groq (Llama 3.3 70B) if Gemini fails for
// any reason (quota, rate limit, model restriction, outage). Two independent
// providers means two independent quota buckets. Keys stay server-side.
// Set GEMINI_API_KEY and GROQ_API_KEY in Netlify: Site settings -> Environment variables.

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const PROMPTS = {
  general: (n) => `Write a natural, flowing passage of plain English prose, about ${n} words, suitable for a typing practice test. Everyday vocabulary, varied sentence length. Plain text only: no markdown, no quotation marks, no lists, no headers.`,
  academic: (n) => `Write an academic-style passage, like the opening of a research paper, about ${n} words. Formal register, discipline-neutral topic. Plain text only: no markdown, no headers, no citations.`,
  business: (n) => `Write a professional business communication passage, like an email or internal memo excerpt, about ${n} words. Plain text only: no markdown, no bullet points, no subject line.`,
  medical: (n) => `Write a passage using medical or clinical terminology, like a case summary or patient note, about ${n} words. Use realistic but generic (non-identifying) clinical language. Plain text only: no markdown.`,
  legal: (n) => `Write a passage of legal-style writing, like a contract clause or filing excerpt, about ${n} words. Plain text only: no markdown, no section numbering.`,
  creative: (n) => `Write a short literary creative-writing passage, evocative descriptive prose, about ${n} words. Plain text only: no markdown, no dialogue, no quotation marks.`,
  programming: (n, lang) => `Write a short, realistic, syntactically correct ${lang} code snippet (a function or small class, roughly 10-18 lines) using common idioms a working developer would actually write. Return ONLY the raw code with normal indentation. No markdown code fences, no explanation, no comments longer than a few words.`
};

function cleanText(text) {
  return text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
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
        generationConfig: { temperature: 0.9, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error(`Gemini returned no text (${candidate?.finishReason || "NO_TEXT"})`);

  return cleanText(text);
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
      temperature: 0.9,
      max_tokens: 800
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned no text");

  return cleanText(text);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const category = payload.category || "general";
  const lang = payload.lang || "javascript";
  const length = Math.min(Math.max(parseInt(payload.length, 10) || 60, 20), 150);

  const promptFn = PROMPTS[category] || PROMPTS.general;
  const prompt = category === "programming" ? promptFn(length, lang) : promptFn(length);

  const errors = [];

  try {
    const text = await tryGemini(prompt);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, provider: "gemini" }) };
  } catch (err) {
    errors.push(String(err.message || err));
  }

  try {
    const text = await tryGroq(prompt);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, provider: "groq" }) };
  } catch (err) {
    errors.push(String(err.message || err));
  }

  return {
    statusCode: 502,
    body: JSON.stringify({ error: "Both providers failed", reason: "ALL_PROVIDERS_FAILED", detail: errors.join(" | ") })
  };
};
