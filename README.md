# Gowtham B — AI/ML Engineer Portfolio

A production-ready, static AI/ML engineer portfolio with a **real** serverless contact form that delivers messages to `gowtham.aiml07@gmail.com`.

## Contact form architecture

The portfolio is a pure static site, so email delivery runs through a small serverless backend:

```
Visitor fills form
        ↓
Client-side validation (inline field errors, honeypot)
        ↓
POST /api/contact              (Vercel)   — api/contact.js
POST /.netlify/functions/contact (Netlify) — netlify/functions/contact.js
        ↓
Server validates again (fields, size, rate limit, honeypot)
        ↓
Server calls Resend API (Reply-To = visitor, To = portfolio email)
        ↓
Provider confirms delivery → real success shown to visitor
```

The browser never contains an API key. All secrets live in **environment variables**. The frontend auto-detects the host (tries the Netlify path, falls back to `/api/contact`). If neither exists (e.g., a static host with no functions), the form shows a clear "not configured" message and never fakes success.

## Required environment variables

| Variable | Purpose | Example |
|---|---|---|
| `RESEND_API_KEY` | Resend API key (create at https://resend.com/api-keys) | `re_AbC123...` |
| `CONTACT_FROM_EMAIL` | Verified sender address (From header) | `contact@yourdomain.com` |
| `CONTACT_TO_EMAIL` | Recipient of all submissions | `gowtham.aiml07@gmail.com` |

Local-only (optional): `.env` file, see `.env.example`. Never commit `.env` — it is gitignored.

## Setting up the email provider (Resend)

1. Create an account at https://resend.com and add the `RESEND_API_KEY`.
2. **Hosting a domain:** Add and verify your domain in Resend (Settings → Domains), then set
   `CONTACT_FROM_EMAIL` to an address on that domain, e.g. `contact@yourdomain.com`.
   Your domain must pass Resend's SPF/DKIM checks before employees can send.
3. **No domain yet (testing only):** use `CONTACT_FROM_EMAIL=onboarding@resend.dev`.
   Resend only delivers from this address **to the account owner's email
   (`gowtham.aiml07@gmail.com`)**, so it is enough to verify submissions but not for
   general visitors on a live site — a verified domain is required for production.

## Run locally

```bash
npm install       # no-op (zero runtime dependencies)
cp .env.example .env   # add RESEND_API_KEY and CONTACT_FROM_EMAIL
npm run dev       # -> http://localhost:3000
```

`server.js` serves the static site and the same contact endpoint the serverless functions use, so you can test the full flow locally (`npm test` runs the automated suite, including an end-to-end test with a mock email provider).

## Deploy

Deploy the entire repository — including `api/` and `netlify/` — to any platform that runs serverless functions:

**Vercel** (uses `api/contact.js`)
1. Import the repository on https://vercel.com.
2. Add the environment variables above (Project → Settings → Environment Variables).
3. Deploy. The form calls `/api/contact`.

**Netlify** (uses `netlify/functions/contact.js`)
1. Add site via Git or drag-and-drop the folder on https://app.netlify.com.
2. Add the environment variables (Site → Settings → Environment Variables).
3. Deploy. The form calls `/.netlify/functions/contact`.

The frontend tries both endpoints automatically in order, so either platform works without code changes.

> **GitHub Pages / other static-only hosts:** they cannot run serverless functions, so the form will show the "not configured" message and the visitor's fallback is the direct `mailto:gowtham.aiml07@gmail.com` link. Use Vercel or Netlify (or a static-form service) for full form functionality.

## Security measures

- No secrets in frontend code; keys only via environment variables.
- Server re-validates every field (length, format, whitespace) — never trusts the client.
- Honeypot field silently drops bot submissions (returns success without emailing).
- Rate limit: max 5 submissions per minute per client IP (429 otherwise).
- 10 KB body ceiling (413), strict JSON content-type (415), method enforcement (405).
- Visitor input is HTML-escaped before being placed into email bodies.
- Provider errors are logged server-side only; visitors get a generic message + direct email fallback.
- Unsupported shapes rejected with 4xx; provider never called for invalid input.

## Files

```
index.html                         portfolio + contact form UI & client JS
api/contact.js                     Vercel serverless function
netlify/functions/contact.js       Netlify serverless function
lib/validation.js                  shared field validation (pure)
lib/http.js                        body size-limit & JSON parsing
lib/resend.js                      email building + Resend delivery
lib/contact-service.js             rate limit, honeypot, config, error handling
server.js                          zero-dependency local dev server
test/                              automated tests (npm test)
.env.example                       environment variable template
.gitignore                         secrets & build artifacts ignored
```