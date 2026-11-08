# Recon map: monday.com (web + iOS/Android)

Scope: Work management core (workspaces, boards, groups, items, subitems, typed columns, views, updates), automations, and the sales CRM product built on top of it.
For: Tafseel Boxes first (orders, production, delivery and sales, in Arabic, RTL), then sold as a product to other businesses in the Gulf.
Date: 2026-11-08
Method: public sources only (help center, pricing, public API docs, store listing). No account walkthrough yet. Items marked *guess* need confirming against a real account, driven by the user.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center: structural hierarchy | https://support.monday.com/hc/en-us/articles/7278527605906 | workspaces > folders > boards/dashboards/docs; groups, items, subitems, columns |
| 2 | help center: column types | https://support.monday.com/hc/en-us/articles/115005310285 | column groups: essentials, super useful, AI, team power-ups, board power-ups, combo |
| 3 | public API: column values | https://developer.monday.com/api-reference/docs/column-values-v2 | value stored as JSON per column type; full list of ~37 column type names |
| 4 | help center: board views | https://support.monday.com/hc/en-us/articles/360001267945 | table, gantt, calendar, chart, battery, numbers, AI dashboard; 100 views per board; locked/pinned views |
| 5 | help center: automations | https://support.monday.com/hc/en-us/articles/360001222900 | recipe = trigger + condition + one or more actions |
| 6 | help center: get started with CRM | https://support.monday.com/hc/en-us/articles/4409464697618 | leads, contacts, accounts, deals, activities boards; pipeline; email timeline; quotes and invoices |
| 7 | pricing guide (monday blog) | https://monday.com/blog/product/monday-com-pricing-which-plan-is-right-for-you/ | Free/Basic/Standard/Pro/Enterprise; what each tier gates |
| 8 | help center: mobile apps | https://support.monday.com/hc/en-us/articles/115005317225 | iOS, iPad, Android apps exist; feature detail not in article |
| 9 | App Store listing | https://apps.apple.com/app/1290128888 | to read by hand for mobile screens |
| 10 | user's own account | (none yet) | recommended next: a free account, clicked through with the user present |

## Core loop

A team puts its work on a board as rows (items) with typed columns, everyone sees status change in real time, and automations plus dashboards turn that board into a process.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign up / log in | /signup, /login | create account, join by invite | form, Google button | empty, error, loading |
| S02 | Onboarding | after sign up | team size, use case, first board from template | stepper, cards | filled |
| S03 | Home | / | recent boards, inbox preview, my work shortcut | cards, list | empty, filled |
| S04 | Left sidebar + workspace switcher | always visible on web | workspaces, folders, boards, dashboards, docs tree | tree, search, menu | collapsed, expanded |
| S05 | Board, main table view | /boards/:id | the core: groups of items with typed columns | group header, item row, cells, column header menu, add-column, toolbar | empty, filled, loading, read-only |
| S06 | Board toolbar | top of S05 | search, person filter, filter, sort, hide columns, group by | chips, popovers | default, active filter |
| S07 | Column center | + at end of columns | pick a column type to add | modal, grid of types, search | default |
| S08 | Cell editors | click a cell | edit status, people, date, timeline, dropdown, numbers, files, etc. | popovers per type | per type: empty, set, editing |
| S09 | Status label editor | "edit labels" in status popover | rename/recolour labels, mark "done" label | colour swatches, inputs | default, editing |
| S10 | Item card (side panel) | click item name | updates feed, files, activity log, item columns | tabs, rich text editor, @mention, attachments | empty, filled |
| S11 | Subitems | expand arrow on item | nested rows with their own columns | nested table | collapsed, expanded |
| S12 | Kanban view | view tab | items as cards in columns by a status column | lanes, cards, drag | empty, filled |
| S13 | Calendar view | view tab | items placed by a date column | month/week grid | empty, filled |
| S14 | Timeline / Gantt view | view tab | items on a time axis by timeline column, dependencies | bars, arrows, zoom | empty, filled |
| S15 | Chart view | view tab | pie/bar of items by column value | chart, settings panel | empty, filled |
| S16 | Form view | view tab + public URL | public form that creates items on submit | form builder, public page | builder, public, submitted |
| S17 | Files view | view tab | all files on the board | grid | empty, filled |
| S18 | Dashboard | sidebar | widgets from one or many boards (numbers, battery, chart, table, calendar) | widget grid, widget settings | empty, filled |
| S19 | My Work | sidebar / top | everything assigned to me across boards, by date | grouped list | empty, filled |
| S20 | Inbox / notifications | bell icon | mentions, assignments, updates on followed items | list, filters, mark read | empty, filled |
| S21 | Automations center | "Automate" on a board | list, templates, custom builder | sentence builder ("When ... if ... then ..."), toggles | empty, list, builder |
| S22 | Automation activity log | in S21 | runs, failures | table | empty, filled |
| S23 | Board permissions / share | board menu | main / shareable / private boards, guests, owners | modal, role selects | default |
| S24 | Invite team / admin users | admin | invite, roles (admin, member, viewer, guest), seats | table, invite modal | default |
| S25 | Templates gallery | "+ New" | start a board from a template | gallery, preview | default |
| S26 | Import | "+ New" > import | create a board from Excel/CSV | upload, column mapping | default, error |
| S27 | Docs (workdoc) | sidebar | rich document that can embed boards/items | block editor | empty, filled |
| S28 | CRM: Leads board | CRM workspace | incoming leads, qualify, convert | S05 + convert button | empty, filled |
| S29 | CRM: Contacts / Accounts boards | CRM workspace | people and companies, linked | S05 + connect-boards column | filled |
| S30 | CRM: Deals board, pipeline view | CRM workspace | deals by stage with value, forecast | kanban by stage, sums | empty, filled |
| S31 | CRM: Emails & Activities (item card tab) | deal/contact item card | Gmail/Outlook thread + logged calls/meetings in one timeline | timeline, composer | empty, filled |
| S32 | CRM: Quotes & invoices | deal item | generate a quote/invoice PDF from deal items | template, line items, PDF | draft, sent |
| S33 | CRM: Sales dashboard | CRM workspace | revenue, win rate, pipeline by stage, by rep | widgets | filled |
| S34 | Account settings / billing | avatar menu | profile, language, plan, seats | forms | default |
| M01 | Mobile: Home / boards list | app launch | recent boards, workspaces | list | empty, filled (*guess*) |
| M02 | Mobile: Board | tap board | items list per group, swipe to change status | list, sheets | filled (*guess*) |
| M03 | Mobile: Item | tap item | columns, updates, add photo from camera | tabs, composer | filled (*guess*) |
| M04 | Mobile: Inbox + push notifications | tab bar | mentions and assignments | list | empty, filled (*guess*) |
| M05 | Mobile: My Work | tab bar | my tasks by date | list | empty, filled (*guess*) |

## Flows

```
F01 New team sets up its first board
    S01 -> S02 -> S25 (pick template) -> S05
    happy path clicks: ~6
    edge: invited user joins existing account, Google sign up, Arabic UI from first screen

F02 Add and update work on a board
    S05 add item (type name, Enter) -> S08 set status / person / date -> status turns green
    happy path clicks: 4
    edge: two users editing same cell at once, very long item name, 1,000+ items, RTL text

F03 Customise a board's structure
    S05 -> S07 add column (e.g. Numbers) -> rename -> S09 edit status labels -> add group
    happy path clicks: ~6
    edge: deleting a column with data (undo), changing a column's type, max columns

F04 Discuss an item
    S05 -> S10 write update, @mention teammate, attach file -> teammate gets S20 notification
    happy path clicks: 3
    edge: mention someone without board access, large file, edit/delete update

F05 Break an item into subitems
    S05 -> S11 add subitems with own status/person -> parent shows progress
    happy path clicks: 3
    edge: subitem columns differ from parent, converting subitem to item

F06 Switch to another view
    S05 -> add view -> S12 kanban by status -> drag card to "Done" -> status column updates
    happy path clicks: 3
    edge: no status column on board, filtered view saved per user vs for everyone

F07 Collect requests through a form
    S16 build form from columns -> share link -> outsider submits -> new item appears in S05
    happy path clicks: ~5
    edge: required fields, spam, file upload on form, form closed

F08 Automate a step
    S21 -> "When status changes to Done, notify owner and move item to group Completed" -> on
    happy path clicks: ~7
    edge: automation loops, monthly action limit reached, recipient removed from board

F09 See what's mine
    S19 my work across boards; S20 inbox, mark read
    happy path clicks: 1
    edge: items on boards user lost access to

F10 Report on progress
    S18 dashboard -> add widgets from 3 boards -> share
    happy path clicks: ~6
    edge: board deleted, permissions differ per board

F11 CRM: lead to closed deal
    S28 new lead (form/import) -> qualify -> convert -> S29 contact + account auto-linked by email domain
    -> S30 deal created, moved across stages -> S31 email logged -> S32 quote sent -> Won
    happy path clicks: ~12
    edge: duplicate contact, account domain is gmail.com, deal lost, currency (AED)

F12 Share with outsiders
    S23 invite guest (client) to a shareable board -> guest sees only that board
    happy path clicks: 4
    edge: guest tries to open other boards, revoking access

F13 Mobile: update work on the go
    M01 -> M02 -> M03 change status, add photo from camera, reply to mention via M04 push
    happy path clicks: 4
    edge: weak network, offline then reconnect (*guess* about offline support)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, tertiary, danger, icon | default, hover, focus, disabled, loading | all |
| Sidebar tree | workspace, folder, board, dashboard, doc | collapsed, expanded, active, drag | S04 |
| Board table | groups, rows, columns, sticky first column, sums footer per group | loading, empty, filled, read-only | S05, S11, S28-S30 |
| Group header | colour, collapse, rename, menu | default, collapsed, editing | S05 |
| Cell + editor (one per column type) | status, people, date, timeline, text, long text, numbers, dropdown, tags, files, link, email, phone, checkbox, rating, formula, connect boards, mirror, location, time tracking, progress, button, dependency, creation log, last updated, auto number, week, hour, country, world clock, vote, color picker | empty, set, editing, read-only, invalid | S05, S08 |
| Status pill | label colours | default, done | S05, S12, S30 |
| People avatar stack | 1, many, overflow | default, unassigned | S05, S19 |
| Popover | menu, picker, form | open, closed | S06, S08 |
| Modal | small, large | open, closed | S07, S23, S26 |
| Side panel (item card) | tabs | open, closed, loading | S10, S31 |
| Rich text editor with @mention | update, reply, doc | empty, typing, sent | S10, S27 |
| View tabs | pinned, locked, add view | active, hover | S05, S12-S17 |
| Kanban lane + card | per status | drag, drop, empty lane | S12, S30 |
| Calendar grid | month, week | default, today | S13 |
| Gantt bars | bar, milestone, dependency arrow | drag, resize | S14 |
| Chart / dashboard widgets | numbers, battery, chart, table, calendar | loading, empty, filled | S15, S18, S33 |
| Sentence builder (automation) | trigger, condition, action slots | incomplete, valid, on, off | S21 |
| Toast | success, error, undo | shown, dismissed | all |
| Empty state | per screen | n/a | all |
| Filter / sort chips | person, status, date | active, inactive | S06 |
| Mobile tab bar, list rows, bottom sheets | n/a | n/a | M01-M05 (*guess*) |

## Inferred data model

```
Account        id, name, slug, plan, locale, created_at
               evidence: pricing [7], account settings S34   confidence: high

User           id, account_id, name, email, avatar, role (admin|member|viewer|guest), locale, timezone
               evidence: S24, plan rules on guests/viewers [7]   confidence: high

Workspace      id, account_id, name, kind (open|closed), members
               evidence: [1]   confidence: high

Folder         id, workspace_id, parent_folder_id, name, position
               evidence: [1] sub-folders   confidence: high

Board          id, workspace_id, folder_id, name, kind (main|shareable|private), owner_ids, description
               evidence: [1], [7] private boards on Pro   confidence: high

Group          id, board_id, title, color, position, collapsed
               evidence: [1]   confidence: high

Column         id, board_id, title, type, settings (json: status labels+colours, dropdown options, formula, linked board ids...), position, width
               evidence: [2], [3]   confidence: high

Item           id, board_id, group_id, parent_item_id (null unless subitem), name, position, creator_id, created_at, updated_at
               evidence: [1], [3] items + subitems   confidence: high
               note: subitems live on their own hidden board in the original (*guess*); a parent_item_id plus a separate subitem column set is simpler

ColumnValue    item_id, column_id, value (json, shape per type), text (searchable)
               evidence: [3] value is JSON per type   confidence: high

Update         id, item_id, author_id, body (rich text), parent_update_id (reply), created_at, edited_at
               evidence: S10 updates feed   confidence: high

Asset (file)   id, item_id | update_id, name, mime, size, storage_key, uploader_id
               evidence: files column, files view   confidence: high

View           id, board_id, type (table|kanban|calendar|timeline|gantt|chart|form|files|map|workload), name, settings (json: filters, sort, group by, hidden columns), owner_id, locked, pinned, position
               evidence: [4] up to 100 views, locked/pinned   confidence: high

Dashboard      id, workspace_id, name, board_ids; Widget: id, dashboard_id, type, settings, layout
               evidence: [1], [4], [7]   confidence: high

Automation     id, board_id, trigger (type + params), conditions (json), actions (ordered json), enabled, creator_id
AutomationRun  id, automation_id, item_id, status, error, actions_used, ran_at
               evidence: [5], monthly action limits [7]   confidence: high (structure), medium (run log fields)

Notification   id, user_id, kind (mention|assign|update|automation), item_id, update_id, read_at
               evidence: S20   confidence: high

Subscription   user_id, item_id | board_id  (who follows what)
               evidence: S20 behaviour   confidence: medium

ActivityLog    id, board_id, item_id, user_id, action, before, after, at
               evidence: item card activity tab, undo   confidence: medium

Doc            id, workspace_id, title, blocks (json)
               evidence: [1]   confidence: high

Form           id, view_id, public_token, settings (questions -> columns), is_open
               evidence: S16   confidence: medium

CRM layer      not separate tables in the original: Leads, Contacts, Accounts, Deals, Activities are boards
               with protected core columns, linked by Connect Boards columns, plus extras:
EmailThread    id, item_id, provider (gmail|outlook), external_thread_id, subject, last_message_at
Quote          id, deal_item_id, number, line_items (json), currency, total_cents, status, pdf_key
               evidence: [6] core boards and columns cannot be deleted; email timeline; quotes & invoices   confidence: high (boards), guess (extra tables)
```

Relationships: Account 1-n Workspace 1-n Folder 1-n Board; Board 1-n Group 1-n Item 1-n Subitem; Board 1-n Column; Item x Column -> ColumnValue; Item 1-n Update 1-n Reply; Board 1-n View; Board 1-n Automation 1-n AutomationRun; Dashboard n-n Board; Connect Boards column = Item n-n Item across boards; Mirror column reads a column through that link.

## Feature matrix

See `features.csv` (extra column `phase` sets the build order). 94 rows. Must: 38, should: 34, could: 16, skip: 6. By phase: 1 = 44, 2 = 24, 3 = 8, 4 = 6, 5 = 6. Three rows are our additions (original = no): Arabic RTL, WhatsApp on contacts, mobile offline.

## Out of scope (cannot or should not be cloned)

- The apps marketplace and its third-party apps: their partner network, not a feature. A plugin system could come much later.
- monday's template library content and help content: write your own templates (e.g. "Orders", "Production", "Deliveries" for a factory).
- Their AI credits system and Sidekick: build your own AI helpers on your own API keys if wanted (listed as could).
- HIPAA compliance, enterprise "panic button", IP allowlisting: certifications and enterprise security are a different business.
- Native integrations they built with partners (Slack, Jira, Salesforce...): each needs its own official API and keys; only Gmail/Outlook (for CRM) and WhatsApp (for Tafseel) are in plan.
- Their name, logo, colours, illustrations and wording.

## Size

Screens 34 web + 5 mobile, flows 13, entities ~18.
Hard parts: (1) real-time collaborative board editing at scale (many users, thousands of items, conflict handling); (2) ~35 column types each with its own editor, filter, sort and automation behaviour; (3) the automation engine (triggers, conditions, actions, limits, loops); plus RTL Arabic everywhere, Gmail/Outlook sync for CRM, and a second client on mobile.
Size: XL. All of it is not one project. Phased:
- Phase 1 (L, ~2-3 months for a small team): web boards core — workspaces, boards, groups, items, subitems, 12 core column types, table + kanban + calendar views, updates, mentions, inbox, my work, permissions, Arabic RTL. Usable for Tafseel orders.
- Phase 2 (M): automations engine + forms + dashboards + more column types.
- Phase 3 (M): CRM layer (leads, contacts, accounts, deals pipeline, activities, quotes in AED, Gmail/Outlook, WhatsApp).
- Phase 4 (M): mobile app (Expo) on the same API.
- Phase 5: billing, multi-tenant onboarding and polish to sell it.
