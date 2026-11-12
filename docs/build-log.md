# Build log: Lawha (working name)

Code: `lawha/` (Next.js app) · demo build: `npm run demo` → `dist-demo/index.html` (single file, same screens, hash routing).
Data: Supabase (`src/lib/data/supabase.ts`) when the env vars are set; the in-browser demo layer (`src/lib/data/fake.ts`) otherwise. Same `DataLayer` interface. See `backend.md`. Parity: 52.6 / 100, must-haves 29 of 37 (batch 3). Batch 2: 42.0, 20 of 37. Batch 1: 20.7, 8 of 37.

| ID | date | status | what is missing | harder than expected |
| --- | --- | --- | --- | --- |
| S01 sign in | 2026-11-08 | partial | real email/Google auth, sign up, invites (backend stage) | — |
| S03 home | 2026-11-08 | partial | recent boards, inbox preview | — |
| S04 sidebar | 2026-11-08 | partial | folders, drag reorder, search; workspace create/rename and drawer done | — |
| S05 board table | 2026-11-08 | partial | drag for groups, move item to another board, virtualised rows for 1,000+ items, keyboard cell navigation (rows drag on desktop; menu on touch) | Sticky name column in RTL: the rounded grid's `overflow: hidden` trapped `position: sticky`; fixed with `overflow: clip`. The grid's auto track also stretched the page on phones until it became `minmax(0, 1fr)`. |
| S06 toolbar | 2026-11-08 | done | — | A new filter started on the people column, so the first thing people saw was names; it now starts on status. |
| views | 2026-11-08 | partial | lock and pin views | Viewers cannot change a shared view, so their filters stay in the tab and the toolbar says they are not saved. |
| S13 calendar | 2026-11-08 | done | week view | Long item names pushed past their day until the grid tracks got `minmax(0, 1fr)`. |
| S23 sharing | 2026-11-08 | done | invites by email (backend) | — |
| S08 cell editors | 2026-11-08 | done | all 13 phase 1 types: status, people, date, timeline, text, long text, numbers, dropdown, checkbox, phone, email, link, files | An empty phone cell had zero height and could not be clicked; fixed with a minimum row height. |
| S07 column center | 2026-11-08 | partial | add any of 13 types, rename, delete with confirm; change type and reorder to do | — |
| S09 label editor | 2026-11-08 | done | — | Deleting a label must not leave items pointing at nothing; the data layer clears those values. **Backend note:** do the same in SQL (a function that updates column settings and strips removed label/option ids). |
| S10 item card | 2026-11-08 | done | rich text formatting (plain text with mentions for now) | Picking a mention then typing fast put the first letter in the wrong place; the caret is now set in a layout effect right after React commits, before the next key. |
| S11 subitems | 2026-11-08 | done | drag reorder | Subitem names slid under the sticky item-name column when the table scrolled; the subitem table now sticks to the start side too. |
| S19 My Work | 2026-11-08 | done | — | — |
| S20 inbox | 2026-11-08 | done | email digest (backend) | — |
| S12 kanban | 2026-11-08 | done | — | HTML drag does not work on touch screens, so each card also has a "move to" select (works on phones and with a keyboard). |
| live sync | 2026-11-08 | partial | across devices needs Supabase Realtime | BroadcastChannel alone dropped some updates between tabs in testing; added the `storage` event as a second signal. 8/8 runs pass after. |

## Drag and due dates (2026-11-12)

The owner asked for:
- a warning when a date has passed
- a countdown sign as the deadline gets close
- quick, light dragging to put one item before or after another

Built from his description in our own style (commits `eac093b` and `897e8ac`).

**Drag** (`src/components/board/drag.ts`)
- One pointer-based helper is used for:
  - rows, which can be dropped into any group
  - phone cards: press and hold, then move
  - group headers: every group folds to its header while one is moving
  - column headers: every group follows the new column order
- While dragging:
  - a light copy follows the pointer and a line shows where it will land
  - the page scrolls when the pointer nears an edge
  - Esc cancels
  - on release the item glides into place, and a plain click still opens or edits
- It replaces the old HTML drag handle, which did not work on touch screens.
- New data layer calls `placeGroup` and `placeColumn`. They are optimistic on Supabase, and positions dragged here win over a fetched copy until they are saved.

**Due dates** (`dueState` and `DueMark` in `cells.tsx`)
- Late: an alert sign and red text, e.g. «متأخر 3 أيام».
- Three days or less left: a ring that fills as the time since the item was made runs out. It turns red on the last day («آخر يوم النهارده»).
- Status done: a check, and the date is struck through.
- Shown in the table, on phone cards and in the date picker.

**Found while testing:** a board reload that started before a write was saved could finish after it and bring back the old order or value. Any reload that overlaps a write now runs once more.

**Checks**
- new suite `drag6`:
  - due marks
  - moving a row inside its group and into another group
  - a click still opens the item
  - moving a column; the other group follows
  - moving a group
  - the order is kept after reload
  - Esc cancels
  - press-and-hold drag on the phone with real touch events
- older suites pass; e2e3 now uses the pointer drag
- real database, locally and on the live site: rows, columns and groups moved and still in place after reload
- live flow test

## Order page on one screen + add button (2026-11-12)

The owner reported that the add-order button did nothing. He also asked that opening an order show a short version of the details, then a checklist of internal tasks he can tick off (struck through when done), then the updates, all on one page with no tabs.

Changes in commit `902c4ae`:
- **Add button**
  - On every screen size, the board's «إضافة طلب» now opens the quick add sheet. On desktop it used to only move the cursor to the add row at the bottom of the first group, so tapping it looked like nothing happened.
  - Pressing add with no name now shows what is missing.
  - Ids made on the device are now real UUIDs even on browsers that lack `crypto.randomUUID`.
- **Order page**
  - One scrolling page:
    1. filled fields as small tiles, two or three per row (empty fields fold behind «حقول فاضية (n)»)
    2. المهام
    3. التحديثات
    4. الملفات and النشاط, folded at the bottom
- **Tasks** are the order's subitems.
  - Ticking a task sets the subitem status to its "done" label, and the task is struck through. Tap a task to rename it; delete has an undo.
  - The progress bar on the page and the board card show the count (1/3).
  - A new task appears at once. The first task on a board creates the task columns, and only once, even if you add tasks quickly.
- **Bugs found while testing on the real database:**
  - The item card moved focus to its close button on every data change, which broke typing in the task box.
  - Opening an item is a route change, so the screens remount. The remounted screen thought nothing was saving, which let a reload drop a write that was still in flight. A new listener is now told the current saving state.
  - A board reload that was already running could drop task columns created meanwhile; the board now reloads after the columns land.
  - Posting an update now counts as saving.

Checks:
- 29/29 unit tests, 9/9 real-database tests
- demo suites phone5 (new), phone4, e2e, e2e2, e2e3
- on the real database, at 390 px and 1280 px: add an order, add two tasks, tick one, post an update, reload; everything is kept. The desktop test ran 5 times in a row after the fix.
- live flow test

## Speed (2026-11-12)

The owner said every change took seconds to show. Measured on the real project: an edit waited for the server (~0.7–1 s), then for the Realtime echo (~1 s), then reloaded the whole board (~1 s, two round trips).

Fix (commits `be59fe0`, `005004c`), all in `src/lib/data/supabase.ts`:
- **Board cache.** Adding, renaming, moving and deleting items, and writing cells, now change the open board in memory first and save after.
  - A value is checked before it shows.
  - If the server refuses a change, the board goes back to how it was and an error appears.
- **New items** get their id on the device and appear at once. Writes to a new item wait until it is saved; if saving it fails, that is reported through `onWriteError`.
- **Changes from other people** arrive over Realtime as single rows and are applied in place, with no board reload. There is now one channel per board and one for account events, shared by all screens, instead of one channel per hook.
- **Views and boards.** Filter and sort changes apply from the cache. A board loads in one round trip, and reopening a board shows the cached copy while it refreshes in the background.
- **Saving note.** «بيحفظ…» shows in the top bar until every write lands, and reloading or closing the page during a save asks first. Found by the live test, which reloaded less than a second after a change and lost it.

| live site, phone 390 px | before | after |
| --- | --- | --- |
| quick add → card with its status | 2.4 s | 0.08 s |
| status change on this phone | 1.6 s | 0.28 s (saved in ~0.6–1 s) |
| same change on a second phone | 1.6 s | 0.8–1.9 s (Realtime delivery) |

Checks: 29/29 unit · 9/9 real-database · demo suites phone4/e2e/e2e2/e2e3 · live desktop flow and live phone speed test. The unit config no longer picks up the real-database tests.

## Phone first (2026-11-10)

The owner said that adding data on a phone was hard, that too many details pulled his attention away, and that he couldn't see everything at a glance. Changes (commit `a14603c`, live):

- **Bottom tab bar** on phones: home, my work, a large **+**, inbox, more (opens the drawer). The top bar keeps only the logo and the avatar.
- **Quick add sheet** (`src/components/QuickAdd.tsx`), reached from the + button, «إضافة <noun>» on the board, or «أضف هنا» under a group:
  - a name field
  - tap choices for status, people and date (today, tomorrow, next week, or another date)
  - the first two number columns
  - text, phone and dropdown columns under «تفاصيل أكتر»
  - «إضافة وكمّل» adds the item, keeps the sheet open and keeps the chosen status
  - values are checked before the item is created, so a wrong value never leaves a half-filled item behind
- **Board on phones = cards**: each card shows the name, status, date (red when late), owners, the first amount, subitem count and update count. Tapping the status opens a sheet of large buttons. The wide table stays on desktop and tablet.
- **Overview home**:
  - three tiles for the items that need you: overdue, today, the next 7 days
  - every board with its item count, a status split bar with counts, and a late count
- Item card opens on **Details** on phones. Sort and hide-columns are hidden on phones because cards have no columns to sort or hide.

Checks: typecheck · 29/29 unit · new phone suite 10/10 (demo build, 390 px, touch) · earlier suites e2e/e2e2/e2e3 pass (e2e now opens the drawer from «المزيد») · `next build` · live on the real database at 390 px: sign up → home, quick add with status/person/date/quantity, reload keeps it, status sheet, no sideways scroll.

Harder than expected:
- The number fields in the sheet overflowed: an `<input>` keeps its default width inside a grid item until it gets `w-0 flex-1`.
- Autofocus in the sheet had to move into the form, because the board loads after the sheet opens.

## Backend (2026-11-08)

- Migrations 0002–0004 tested locally against Postgres with Supabase stand-ins, then run by the owner in the SQL Editor.
- Real project: 9/9 integration tests (isolation between companies, invitations, guest, viewer, mention, live update, files). Browser test of the real app: sign up, edit, reload, second device live, invite link.
- Found on the real project: an invitation preview failed for visitors who were not signed in yet (needed a definer function, 0004); the database's "not editable" refusal showed as raw English instead of the view-only message.

## Checks run, batch 3

- 29/29 unit tests (adds: guest scoping, private boards, sharing rules and last owner, saved views and personal views, group move/recolour, removed labels/options clear values, workspaces; view filters and sorts as a pure module)
- Browser flow test 3: status filter saved with the view across reload, person filter, sort descending, hide column, rename a label, move to group, drag a row, group up, calendar day list, private board hidden from a member, new workspace, guest sees only the shared board, viewer filters locally. Phone: calendar and filter popover fit 390px. No console errors.
- Batch 1 and 2 suites rerun: all pass. `next build` passes.

## Checks run, batch 2

- typecheck clean · 17/17 data tests (adds: assignment and mention notifications never to the author or twice, mark read, subitems, column add/rename/delete, new type validation, My Work, files limit, activity) · `next build` passes · SQL access tests pass after adding the new column checks to `schema.sql`
- Browser flow test 2: item card from the name, @mention by keyboard, reply, edit a cell in Details, activity entry, Escape closes, subitems add, add checkbox column and tick it, new dropdown option from the cell, invalid phone rejected, inbox shows the mention with the right unread count and opens the item, My Work groups, item card full screen at 390px. No console errors.
- Batch 1 flow test rerun: all pass.

## Checks run, batch 1

- `npm run typecheck`: clean
- `npm test`: 9/9 (data layer: order, add, one-cell writes, validation, move, delete/undo, viewer blocked, new board, persistence)
- `next build`: passes
- Browser flow test (demo build, Chrome): sign in, live status change across two tabs, live add across tabs, invalid number rejected, Arabic digits accepted, delete + undo, search, kanban move, new board, viewer read-only, phone width 390 with no page overflow. No console errors (only a missing favicon on the local server).
- Screenshots: `clone-screens/` (S01, S04 drawer, S05 at 1440/390/dark, S08 popover, S12).

## Next

Web phase 1 is done end to end on a real backend, except moving an item to another board. Remaining must-haves are the mobile app (phase 4). Next: deploy (Vercel + SMTP + email confirmation back on), then replica-test across all flows, then the mobile app.
