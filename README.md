# Typing Speed Studio — AI Edition

A premium single-page typing test app with optional Gemini-powered passage
generation and post-session coaching. The frontend is a static file
(`index.html`); the two AI features call small serverless functions that hold
your Gemini API key so it never appears in browser-visible code.

## Project structure

```
index.html                          <- the app itself (open directly, works with AI off)
netlify/functions/generate-passage.js   <- generates typing passages via Gemini
netlify/functions/coach-feedback.js     <- generates post-session coaching via Gemini
netlify.toml                        <- tells Netlify where the functions live
```

## Running it without AI

Just open `index.html` in a browser. Every mode and category works fully
offline using the built-in local passage banks. The ✨ AI toggle in the top
bar stays off by default.

## Turning on AI (passages + coaching)

The AI features need a deployed backend because the Gemini key must live on
a server, not in the page. Netlify's free tier functions are the easiest way
to do this.

### 1. Get a free Gemini API key
Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and
generate a free API key. Free-tier usage on Gemini 2.5 Flash-Lite (the model
these functions use) is generous enough for personal use — occasional
passage/coaching calls per session are well within the daily quota. Two
things worth knowing about the free tier:
- Free-tier prompts/responses may be used by Google to improve their
  products (this is disclosed in their terms) — fine for typing passages,
  just don't paste anything sensitive into a "Custom Text" AI extension later.
- Rate limits are enforced per project and can change; if you ever hit them,
  the app automatically falls back to the local passage banks and shows a
  toast notification, so nothing breaks.

### 2. Deploy to Netlify
Easiest path with the Netlify CLI:

```bash
npm install -g netlify-cli
cd typing-speed-studio      # this project folder
netlify init                # creates/links a Netlify site
netlify deploy --prod
```

Or connect this folder as a GitHub repo and link it in the Netlify
dashboard (New site from Git) — Netlify will detect `netlify.toml`
automatically and deploy both the static site and the functions.

### 3. Set your API key as an environment variable
In the Netlify dashboard: **Site settings → Environment variables → Add a
variable**
- Key: `GEMINI_API_KEY`
- Value: your key from AI Studio

Redeploy (or trigger a new deploy) after adding it so the functions pick it
up.

### 4. Test locally (optional)
```bash
netlify dev
```
This runs the static site and functions together on `localhost`, using a
`.env` file (create one with `GEMINI_API_KEY=your_key_here`, and make sure
`.env` is in your `.gitignore` — never commit real keys).

### 5. Use it
Open your deployed site, click the ✨ icon in the top bar. New sessions will
request a freshly generated passage from Gemini for the selected category
(Custom Text mode is unaffected — it always uses what you paste in). After
finishing a session, an "AI Coach" card appears in the results dashboard
with a short personalized note based on your actual numbers.

If your functions live somewhere other than `/.netlify/functions` (e.g. a
different host), you can change the endpoint base in
**Settings → AI enhancement → Function endpoint base**.

## Notes on the AI functions

Both functions use `gemini-2.5-flash-lite` — the fastest, most rate-limit-
friendly free-tier model, appropriate for short, frequent, low-stakes calls
like these. If you want higher-quality prose you can swap the `MODEL`
constant in either function to `gemini-2.5-flash`, at the cost of a lower
free-tier rate limit.

Every AI call has a local fallback: if the request fails, times out, or the
key isn't configured, the app silently drops back to its built-in passage
banks so the typing test itself is never blocked by the AI layer.
