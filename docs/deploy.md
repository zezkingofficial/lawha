# Deploy: Lawha (working name)

Target: Tafseel Boxes' own team first (internal use), on Vercel + the existing Supabase project. Selling to other companies comes after replica-entrepreneur, replica-brand and replica-launch.

## Preflight (2026-11-08)

| check | result |
| --- | --- |
| brand sweep (`sweep.py lawha --config replica/brand.json`) | **clean**, exit 0. One false hit (the weekday "Monday" in a code comment) reworded first. |
| typecheck | clean |
| unit tests | 29/29 |
| browser flow tests (demo build) | batch 1: 8/8 · batch 2: 9/9 · batch 3: 13/13 · no page errors |
| real-project integration tests | 9/9 (isolation, invites, guest, viewer, mention, live update, files) |
| real app in a browser on Supabase | sign up, edit, reload, second device live, invite link: all pass |
| production build (`next build`) | passes |
| `npm audit --omit=dev` | 0 vulnerabilities after pinning PostCSS 8.5.32 (Next 15 bundled an old copy with a high advisory) |
| parity (`parity.py`) | 56.5 / 100, must-haves 33 of 37. Missing: mobile app (3), move item to another board. **Fine for internal use; not ready to sell.** |
| open S1/S2 bugs | none known |
| favicon / title | own icon (ل on the accent colour), title «لوحة» |

## By hand, before other companies sign up (not blocking internal use)

- [ ] privacy policy and terms pages listing processors (Supabase, Vercel)
- [ ] account deletion in the app (needed for the App Store later)
- [ ] final name, palette and logo (replica-brand)
- [ ] custom SMTP (Resend) + Confirm email back on

## Production services

- Database: the current Supabase project serves as production for Tafseel. Test companies (`test-…@lawha-test.dev`) can be deleted in Authentication → Users. Turn on daily backups if the plan allows (free plan has none; Pro has daily).
- Env vars on Vercel (names from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No secret key anywhere in the app.
- Supabase → Authentication → URL Configuration: Site URL = the Vercel address; add `https://<address>/**` to Redirect URLs.

## Host

Vercel, connected to the GitHub repo: every push to `main` deploys; pull requests get preview links. HTTPS automatic.

## Live

- URL: _to fill after the first deploy_
- Checked on the live site: _to fill_

## First week, watch

- Vercel → Logs for errors; Supabase → Logs → Postgres and Auth for refused writes
- Supabase → Database usage (free plan: 500 MB) and Storage (1 GB)
- Ask two teammates to use it on their phones for real orders and note anything confusing
