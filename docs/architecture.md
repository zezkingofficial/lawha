# Architecture: working name "Lawha" (a rebuild of monday.com's core features)

Name is a placeholder until replica-brand. Reads recon.md and features.csv (2026-11-08).
This plan covers phase 1 in full and fixes the decisions phases 2-5 depend on, so nothing is rebuilt later.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | one codebase for pages, server actions and API; Ahmed's calculator is already React |
| board grid | TanStack Table + TanStack Virtual | thousands of rows scroll smoothly; we own every cell renderer |
| drag and drop | dnd-kit | rows, groups, kanban cards, columns; works in RTL |
| UI kit | shadcn/ui on Radix | accessible popovers, menus, dialogs; Radix supports `dir="rtl"` |
| styling | Tailwind with logical properties only (`ms-`, `pe-`, `start-`) | one stylesheet works for Arabic RTL and English LTR |
| i18n | next-intl, Arabic default, English second | locale per user; Arabic numerals optional per account |
| database | Postgres on Supabase | relational data, jsonb for cell values, row level security for multi-company |
| realtime | Supabase Realtime (Postgres changes + presence) | live board updates and "who is viewing" without our own socket server; respects RLS |
| auth | Supabase Auth (email + Google) | magic links and invites built in |
| files | Supabase Storage, private bucket `assets` | signed URLs, storage policies mirror board access |
| email | Resend from our own domain | invites and notification digests |
| jobs | Supabase pg_cron + Edge Functions (phase 1); Inngest (phase 2 automations) | phase 1 only needs two schedules; the automation engine needs retries and step functions |
| payments | Stripe Checkout + Billing (phase 5) | available for UAE companies; only needed to sell it |
| mobile | Expo (React Native) (phase 4) | same Supabase client and TypeScript types as the web |
| hosting | Vercel (region bom1, Mumbai) + Supabase (region ap-south-1, Mumbai) | closest regions to the UAE for both; same region keeps queries fast |

One database. No microservices. Nothing from monday's own servers is called.

## Schema

Tables: 19. Access rules: Postgres row level security on every table, through four helper functions (`app.account_role`, `app.can_read_board`, `app.can_edit_board`, `app.can_admin_board`). Full SQL in `schema.sql`, tests in `tests/rls_test.sql`.

```
accounts ── account_members ── profiles (= auth.users)
   │            invitations
   └─ workspaces ── workspace_members
        └─ folders (nested)
        └─ boards ── board_members
             ├─ groups ── items (top level)
             │              └─ items (subitems, parent_item_id)
             ├─ columns (scope item | subitem)
             ├─ views
             └─ updates, assets, activity_log
items ── item_assignees (from people columns)   subscriptions ── notifications
```

Key decisions:

- **Every row carries `account_id`.** It is a multi-company product from day one, even while Tafseel is the only company. Selling it later is a sign-up page, not a migration.
- **Cell values live in one `items.vals` jsonb, keyed by column id**, not a row per cell. A board loads in one query, realtime sends one event per item, and filtering uses a GIN index. Lost updates are prevented by writing one cell at a time through `app.set_cell`, which uses `jsonb_set` on that key only. Tested: clearing one cell leaves the others.
- **Value shapes per column type** (validated in `app.set_cell`):

  | type | value |
  | --- | --- |
  | status, priority, label | `{"label_id":"done"}` — labels, colours and the "done" flag in `columns.settings.labels` |
  | people | `{"user_ids":["..."]}` |
  | date | `{"date":"2026-11-20"}` (a calendar date, no time zone) |
  | timeline | `{"from":"2026-11-01","to":"2026-11-20"}` |
  | numbers | `{"number":"500"}` — unit (AED, pcs) in `columns.settings` |
  | text, long_text | `{"text":"..."}` |
  | dropdown | `{"option_ids":["..."]}` |
  | checkbox | `{"checked":true}` |
  | phone, link, email | `{"phone":"+9715..."}`, `{"url":"...","label":"..."}`, `{"email":"..."}` |
  | files | `{"asset_ids":["..."]}` |

- **Subitems are items with `parent_item_id`** and their own column set (`columns.scope = 'subitem'`). A trigger copies board and account from the parent.
- **Ordering uses fractional text keys** (`position`, collation "C", generated with the `fractional-indexing` npm package): moving a row writes one row, never renumbers a group.
- **Soft delete** (`deleted_at`) on boards, groups and items gives undo and a 30-day trash.
- **Triggers do the bookkeeping** so no client can forget it: search text, `item_assignees` from people columns, the activity log (every cell change with before/after), subscriptions, and notifications (mention, assigned, update; never to the author, never twice). All tested.
- **Permissions match the original's model**: account roles admin / member / viewer / guest; workspaces open / closed; boards main / shareable / private; board roles owner / editor / viewer. Guests see only boards they are added to. Tested across two companies: no leak.

Phase 2-3 tables, planned not yet in SQL: `automations`, `automation_runs`, `forms`, `dashboards`, `dashboard_widgets`, `docs`, `email_threads`, `quotes`, `whatsapp_messages`. CRM boards are ordinary boards with `columns.is_protected = true` on core columns, as in the original.

## API

Most reads and simple writes go straight from the browser to Postgres with supabase-js, under RLS. Multi-step writes are Postgres functions (one transaction each). Anything that sends email or touches secrets is a Next.js server action.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| server action `signUp` / Supabase Auth | create user, profile, account, first workspace | anyone | name, email, company | session | F01 |
| server action `inviteMember` | create invitation, send email | admin | email, role, board (guests) | invitation | F01, F12 |
| server action `acceptInvite` | add member (and board member for guests) | invitee | token | account | F01, F12 |
| rpc `app.create_board` | board + owner + group + 3 default columns + main view | admin, member | workspace, name, kind | board | F01 |
| rpc `app.create_board_from_template` (phase 1b) | copy a template's groups, columns, views, sample items | admin, member | workspace, template | board | F01 |
| select `boards`, `groups`, `columns`, `views`, `items` | load a board (items paged per group, 200 at a time) | board readers | board id | rows | F02 |
| insert/update/delete `items` | add, rename, move (group + position), soft delete, restore | board editors | item fields | item | F02 |
| rpc `app.set_cell` | write one cell, validated | board editors | item, column, value | item | F02 |
| insert/update/delete `groups`, `columns` | board structure | board editors (protected columns locked) | fields | row | F03 |
| rpc `app.change_column_type` (phase 2) | convert values between types | board editors | column, type | column | F03 |
| insert `items` with `parent_item_id` | subitem | board editors | name, parent | item | F05 |
| insert/update `views` | save filters, sort, hidden columns, kanban/date column; personal or shared | board editors | settings | view | F06 |
| insert `updates`, `assets` + Storage upload | post an update with mentions and files | board readers (not viewers) | body, mentions, files | update | F04 |
| select `items` join `item_assignees` | My Work: my items across boards, by date | self | — | items | F09 |
| select/update `notifications` | inbox, mark read | self | — | rows | F09 |
| select `items` where `search_text ilike` | board search (trigram index, works in Arabic) | board readers | text | items | F02 |
| insert/delete `board_members`, update `boards.kind` | share, make private, add guest | board owner, admin | user, role | rows | F12 |
| realtime channel `board:{id}` | item/group/column changes + presence | board readers | — | events | F02 |

Webhooks in: none in phase 1 (Stripe in phase 5, Gmail/Outlook push in phase 3).
Webhooks out: none in phase 1 (automation "send webhook" action in phase 2).
Jobs:
- `notify-digest`, every 10 minutes: email unread notifications older than 10 minutes, one email per user, then set `emailed_at`. Respects a per-user setting.
- `purge-trash`, daily 02:00 Asia/Dubai: hard-delete boards, groups, items with `deleted_at` older than 30 days, and their storage files.

## The parts that bite

- **Two people editing at once**: cell-level writes via `app.set_cell` (no lost cells); same cell = last write wins, shown live to both. Optimistic UI rolls back on error. Renaming the same item at once is also last write wins; good enough, the original behaves the same.
- **Big boards**: virtualised rows, items loaded per group in pages of 200, sums computed in SQL not in the browser. Target: 5,000 items on a board stays fast. Hard limit 10,000 per board in phase 1.
- **RTL Arabic**: logical CSS only (a lint rule bans `ml-`/`mr-`/`left-`/`right-`), the first (name) column sticks to the start side, kanban flows right to left, date pickers and the timeline axis flip, numbers and phone numbers inside Arabic text use `dir="ltr"` spans. Test every screen in both directions.
- **Time zones**: date and timeline cells are calendar dates, not instants, so they never shift between users. Timestamps (`created_at`, notifications) are `timestamptz` in UTC, shown in the user's zone (default Asia/Dubai; other Gulf zones and DST countries come with selling it).
- **Realtime and RLS**: Supabase Realtime checks RLS per subscriber; one channel per open board keeps fan-out small. Losing a connection triggers a full board refetch on reconnect.
- **Ordering**: fractional keys can grow long after thousands of moves in the same spot; a nightly job rebalances groups whose keys pass 50 characters.
- **Multi-tenancy**: every table has RLS and the test file proves another company sees nothing. Any new table must add a policy and a test before merge.
- **Files**: 100 MB per file (checked in the table and by the bucket), images get thumbnails, storage policies use the same `app.can_read_board`.
- **Permissions in triggers**: helper functions are `security definer` with a fixed `search_path`; they only read, never write user data.
- **Deleting a user**: profile cascade removes memberships; their items stay with `created_by` set to null; updates keep the text with "deleted user".
- **Email deliverability**: SPF, DKIM, DMARC on the sending domain before the first invite goes out.

## Build order

1. **Vertical slice** (week 1-2): S01 sign up → S04 sidebar → S05 board with groups and items → S08 status, people, date, text cells → realtime between two browsers. Tables: accounts, profiles, account_members, workspaces, boards, board_members, groups, columns, items, item_assignees, views. Arabic RTL from the first screen.
2. **Phase 1 must-haves** (week 3-10), by area:
   - boards: subitems (S11), reorder and move, undo, search/filter/sort/person filter (S06), group sums
   - columns: the remaining phase 1 types and the column center (S07, S09)
   - views: kanban (S12), calendar (S13), saved filters
   - collaboration: item card with updates, mentions, files (S10), inbox (S20), My Work (S19), email digest
   - team: invites, roles, board permissions and guests (S23, S24)
   - templates for Tafseel: Orders, Production, Deliveries, Suppliers
3. **Phase 2 should-haves**: automations (S21, S22), forms (S16), dashboards (S18), timeline/gantt (S14), chart (S15), import/export, formula/connect/mirror columns.
4. **Phase 3** CRM, **phase 4** mobile, **phase 5** billing and onboarding for other companies.
5. **Fixes from replica-entrepreneur**: added once that stage has read real user complaints about monday.com.
