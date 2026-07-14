# Typing Speed Studio — AI Edition

A premium single-page typing test app with optional Gemini-powered passage
generation and post-session coaching. The frontend is a static file
(`index.html`); the two AI features call small serverless functions that hold
your Gemini API key so it never appears in browser-visible code.

## Project structure

```
index.html                              <- the app itself (open directly, works with AI off)
netlify/functions/generate-passage.js   <- generates typing passages via Gemini
netlify/functions/coach-feedback.js     <- generates post-session coaching via Gemini
netlify.toml                            <- tells Netlify where the functions live, pins Node 20
```

## Running it without AI

Just open `index.html` in a browser. Every mode and category works fully
offline using the built-in local passage banks. The AI toggle in the top
bar stays off by default.

## Turning on AI (passages + coaching)

The AI features need a deployed backend because the Gemini key must live on
a server, not in the page. Netlify's free tier functions are the easiest way
to do this.

### 1. Get a free Gemini API key
Go to Google AI Studio (aistudio.google.com/app/apikey) and generate a free
API key.

### 2. Deploy to Netlify
```bash
npm install -g netlify-cli
cd typing-speed-studio
netlify init
netlify deploy --prod
```
Or connect the folder as a GitHub repo and link it in the Netlify dashboard
(New site from Git) — netlify.toml is auto-detected.

### 3. Set your API key as an environment variable
Netlify dashboard -> Site settings -> Environment variables -> Add a variable
- Key: GEMINI_API_KEY
- Value: your key from AI Studio

Then trigger Deploys -> Trigger deploy -> Clear cache and deploy site
(a plain redeploy sometimes keeps a stale build cache, clearing it avoids that).

### 3b. Add a Groq key too (fallback provider, recommended)

Both functions now try Gemini first, and automatically fall back to Groq
(Llama 3.3 70B) if Gemini fails for any reason: quota exhausted, rate
limited, model restricted, or a temporary outage. Two providers means two
completely separate quota buckets, so the app is far less likely to fall
all the way back to the offline passage banks.

Get a free Groq key at console.groq.com (no credit card, no prepaid
credits required, unlike some other providers). Add it the same way:
- Key: GROQ_API_KEY
- Value: your key from GroqCloud

Redeploy after adding it. If GROQ_API_KEY isn't set, the app still works
fine, it just skips straight to the local passage banks if Gemini fails.
Every response now includes a `provider` field (`"gemini"` or `"groq"`) so
you can tell which one actually served a given request.

### 4. Test locally (optional)
```bash
netlify dev
```
Uses a .env file (GEMINI_API_KEY=your_key_here), keep .env out of git.

### 5. Use it
Click the AI icon. New sessions request a fresh passage for the selected
category (Custom Text mode always uses what you paste in). After finishing a
session, an "AI Coach" card appears with a short note based on your actual
numbers.

## Model notes — read this before you deploy

Both functions currently call:
```js
const MODEL = "gemini-2.5-flash";
```

Why not gemini-2.5-flash-lite? It's still listed as free-tier on Google's
pricing page, but in practice Google has quietly closed it off to newly
created API keys — you'll get a 404 NOT_FOUND with the message "This model
... is no longer available to new users" even though the docs don't mention
that anywhere. If your key was created recently, use gemini-2.5-flash
instead, which doesn't have that restriction as of this writing. If Google
changes this again, the fix is a one-line swap of the MODEL constant in both
function files — check the live model list at
ai.google.dev/gemini-api/docs/models if something breaks again.

Thinking tokens. Gemini 2.5 models reason internally before writing output,
and that reasoning eats into your maxOutputTokens budget by default. Both
functions set thinkingConfig: { thinkingBudget: 0 } to skip that and
guarantee the token budget goes to actual passage/coaching text instead of
invisible reasoning. If you ever see an empty response with no error, this
is the first thing to check.

Rate limits. Free tier is commonly around 10 requests per minute on
Flash-class models, enforced per Google Cloud project, not per key. Every
mode/category change in the app fires a new AI request, so rapid clicking
while testing can trip a 429. The app has a local fallback for exactly this —
if a request fails for any reason (rate limit, bad key, model issue), it
silently drops back to the built-in passage banks and shows a toast, so the
typing test itself never breaks.

## Debugging a failed AI call

1. Open browser DevTools (F12) -> Console tab. Failed requests log as
   [TSS] AI passage request failed: <reason> or the coaching equivalent.
2. For the full detail, check the Network tab -> find the
   generate-passage or coach-feedback request -> Response tab. The
   function returns { error, status, detail } or { error, reason, detail }
   with Google's actual error message inside detail.
3. Common reasons: GEMINI_API_KEY is not configured (env var not set or not
   redeployed after setting it), 404 (wrong/restricted model name), 429
   (rate limited, wait a minute), NO_TEXT (thinking tokens issue, should be
   fixed already by the config above), ALL_PROVIDERS_FAILED (both Gemini
   and Groq failed, check the detail field, it lists both errors separated
   by a pipe).
4. Check the provider field in a successful response to see whether Gemini
   or Groq actually served that request. If you're consistently seeing
   "groq", Gemini is currently failing and falling through silently, worth
   checking why even though the app kept working.

## Notes on the AI functions

Every AI call has a local fallback: if the request fails, times out, or the
key isn't configured, the app drops back to its built-in passage banks so the
typing test is never blocked by the AI layer.
