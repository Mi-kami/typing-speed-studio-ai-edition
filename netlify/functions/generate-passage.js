// netlify/functions/generate-passage.js
// Holds the Gemini API key server-side. Never expose GEMINI_API_KEY in frontend code.
// Set GEMINI_API_KEY in Netlify: Site settings -> Environment variables.

const MODEL = "gemini-2.5-flash";

const PROMPTS = {
  general: (n) => `Write a natural, flowing passage of plain English prose, about ${n} words, suitable for a typing practice test. Everyday vocabulary, varied sentence length. Plain text only: no markdown, no quotation marks, no lists, no headers.`,
  academic: (n) => `Write an academic-style passage, like the opening of a research paper, about ${n} words. Formal register, discipline-neutral topic. Plain text only: no markdown, no headers, no citations.`,
  business: (n) => `Write a professional business communication passage, like an email or internal memo excerpt, about ${n} words. Plain text only: no markdown, no bullet points, no subject line.`,
  medical: (n) => `Write a passage using medical or clinical terminology, like a case summary or patient note, about ${n} words. Use realistic but generic (non-identifying) clinical language. Plain text only: no markdown.`,
  legal: (n) => `Write a passage of legal-style writing, like a contract clause or filing excerpt, about ${n} words. Plain text only: no markdown, no section numbering.`,
  creative: (n) => `Write a short literary creative-writing passage, evocative descriptive prose, about ${n} words. Plain text only: no markdown, no dialogue, no quotation marks.`,
  programming: (n, lang) => `Write a short, realistic, syntactically correct ${lang} code snippet (a function or small class, roughly 10-18 lines) using common idioms a working developer would actually write. Return ONLY the raw code with normal indentation. No markdown code fences, no explanation, no comments longer than a few words.`
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }) };
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

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 800,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Gemini API error", status: resp.status, detail: errText }) };
    }

    const data = await resp.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      // Distinguish common silent-failure causes so the frontend can show something useful
      const reason = candidate?.finishReason || "NO_TEXT";
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Gemini returned no usable text",
          reason,
          detail: JSON.stringify(data).slice(0, 500)
        })
      };
    }

    // Strip stray markdown fences if the model added them despite instructions
    const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Request to Gemini failed", detail: String(err) }) };
  }
};
