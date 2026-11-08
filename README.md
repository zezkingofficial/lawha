# Lawha (لوحة)

Board-based work management for Tafseel Boxes, Arabic first. Next.js + Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm run dev                  # http://localhost:3000
```

Without the two env vars the app runs on sample data saved in the browser.

## Checks

```bash
npm run typecheck
npm test                                              # data layer + view rules
npx vitest run -c vitest.integration.config.ts        # against a real Supabase project (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
npm run demo                                          # single-file demo in dist-demo/
```

## Database

Fresh Supabase project: run `supabase/lawha-setup.sql` once in the SQL Editor (it is migrations 0001–0004 in order).
Local tests for the SQL: `supabase/tests/`.

## Deploy (Vercel)

1. Import this repo in Vercel (framework: Next.js, no settings to change).
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. In Supabase → Authentication → URL Configuration set the Site URL to the Vercel address and add `https://<address>/**` to Redirect URLs.

Never put the Supabase secret key in this app or this repo.

## Docs

Planning and decisions in `docs/`: recon, architecture, schema, design tokens, feature matrix, build log, backend and deploy notes.
