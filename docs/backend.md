# Backend: Lawha on Supabase

Project: `wotxrkevoyhlcftbxdww` (region chosen by the owner). Keys in the app: project URL and the **publishable** key only (`lawha/.env.local`, see `.env.example`). The secret key is never in the app or in this repo.

## What runs where

| part | where | notes |
| --- | --- | --- |
| tables, access rules, triggers | Postgres (`lawha/supabase/migrations/0001`–`0004`) | 0001 = `replica/schema.sql`; 0002 Supabase wiring; 0003 guest workspaces, column delete cleanup, people list; 0004 invitation preview for visitors |
| sign up / sign in / reset | Supabase Auth, email + password | `profiles` row created by trigger; first sign-up creates the company, a workspace and two starter boards (`bootstrap_account`) |
| invitations | `invitations` table + `accept_invitation` | admin creates a link on the Team page and sends it (WhatsApp share button); the link only works for the invited email, once, for 14 days |
| files | Storage bucket `assets` (private, 100 MB/file) | path `{account}/{board}/{random}-{name}`; read/write rules reuse `can_read_board` / `can_edit_board`; served by 1-hour signed links |
| live updates | Realtime on items, groups, columns, views, updates, board_members, boards, notifications | RLS decides what each person receives |
| app ↔ database | `lawha/src/lib/data/supabase.ts` | same `DataLayer` interface as the demo layer; the app picks it when the two env vars are set |

## Verified on the real project (2026-11-08)

`npx vitest run -c vitest.integration.config.ts` (9/9):
company bootstrap · item add and cell write, bad value rejected · **another company sees nothing and cannot write** · invitation link joins the right person only · mention notification · live update reaches another session · file upload, signed link works, other company sees no files · guest sees only the shared board and cannot create boards · viewer cannot edit.

Browser test of the real app (Next.js build on the real project): sign up → home, add item and set status, survives reload, second device sees a change live, Team page makes an invite link.

Test companies use emails `test-…@lawha-test.dev`; they are isolated by RLS and can be deleted in Authentication → Users.

## Security checklist

- [x] secrets only in env vars; `.env*` ignored by git; only the publishable key reaches the browser
- [x] input validated on the server: `app.set_cell` checks every cell type; check constraints on every table
- [x] authorisation on every read and write: RLS on all 19 tables + storage; tested with a second company, a guest and a viewer
- [ ] rate limits on sign-up and auth: Supabase Auth defaults for now; review before opening sign-up publicly
- [n/a] webhooks: none yet (Stripe comes with billing)
- [x] uploads: 100 MB limit in the bucket, private bucket, signed links
- [x] no user data in URLs or logs (invite tokens are random, single use, expire)
- [ ] `npm audit`: run before deploy
- [ ] privacy policy listing processors (Supabase, host) before other companies sign up

## Before real use (deploy stage)

1. **Turn Confirm email back on** (Authentication → Sign In / Providers → Email) once custom SMTP is set, so confirmation emails actually arrive.
2. **Custom SMTP** (Resend, from your own domain): Supabase's built-in mailer only sends a few emails an hour.
3. **Site URL and redirect URLs** in Authentication → URL Configuration = the deployed address, so reset and confirmation links open the app.
4. **Rotate the secret key** that was shared in chat on 2026-11-08, and confirm in Project Settings → API Keys that the old one is deleted.
5. Deploy the Next.js app (Vercel) with the two env vars.

## Not done yet

Email notification digest (needs SMTP + a scheduled function), moving an item to another board, admin billing (phase 5), mobile app (phase 4).
