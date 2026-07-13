// netlify/functions/coach-feedback.js
// Holds the Gemini API key server-side. Never expose GEMINI_API_KEY in frontend code.

const MODEL = "gemini-2.5-flash-lite";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }) };
  }

  let s;
  try {
    s = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const mistypes = Array.isArray(s.topMistypes) && s.topMistypes.length
    ? s.topMistypes.join(", ")
    : "none notable";

  const prompt = `You are a friendly, concise typing coach. A user just finished a typing test with these results:
- Mode: ${s.mode || "unknown"}, category: ${s.category || "unknown"}
- Net WPM: ${s.wpm ?? "n/a"}
- Accuracy: ${s.accuracy ?? "n/a"}%
- Consistency: ${s.consistency ?? "n/a"}%
- Mistakes: ${s.mistakes ?? "n/a"}
- Most mistyped characters: ${mistypes}

Write 2-3 short sentences of specific, encouraging, non-generic coaching feedback based on these exact numbers. Reference at least one concrete number. Suggest one specific, actionable next step. Plain text only, no markdown, no bullet points, no greeting.`;

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
            temperature: 0.7,
            maxOutputTokens: 400,
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
    const feedback = candidate?.content?.parts?.[0]?.text?.trim();

    if (!feedback) {
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Request to Gemini failed", detail: String(err) }) };
  }
};
