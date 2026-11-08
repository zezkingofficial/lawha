# Components: Lawha (working name)

Every component from the recon list. Tokens only (Tailwind classes from `tailwind.tokens.js`), Lucide icons (ISC licence), IBM Plex Sans Arabic (OFL). All copy here is our own.

Rules that apply to every component:

- **Direction**: built with logical properties only (`ps-`, `me-`, `start-`, `border-s`). Arabic (RTL) is the default; English flips automatically. Icons that point a direction (chevrons, arrows, "back") mirror with `rtl:-scale-x-100`; icons that do not (search, bell, plus) never mirror.
- **Numbers, phones, dates inside Arabic text** sit in `<bdi>` or `dir="ltr"` spans so "+971 50 123 4567" and "500 pcs" render the right way round.
- **Focus**: every interactive element shows `:focus-visible` as a 2px `focus` ring with 2px offset. Never removed.
- **Hit size**: 32px minimum on desktop, 44px on touch (`@media (pointer: coarse)`).
- **Motion**: `fast` 120ms for hovers, `base` 200ms for popovers and panels, all off under `prefers-reduced-motion`.
- **States everywhere**: default, hover, focus-visible, active, disabled, loading. Empty and error states are part of the spec, not extras.

---

## Primitives

```
Button
  variants  primary (bg accent, text on-accent), secondary (bg surface, border border-strong, text text),
            ghost (transparent, text text, hover surface-hover), danger (bg danger, text on-accent)
  sizes     sm 28px / text sm, md 32px / text base, lg 40px / text md; px 12/12/16; radius sm
  states    default, hover (accent-hover or surface-hover), active (translate-y 1px), focus-visible ring,
            disabled (50% opacity, no pointer), loading (spinner replaces leading icon, label kept, aria-busy)
  icon      optional leading/trailing Lucide 16px; icon-only variant is square and needs aria-label
  a11y      real <button>; type="button" unless it submits
  used on   everywhere
```

```
IconButton
  sizes     28, 32, 40 square; radius sm
  states    as Button ghost; tooltip on hover/focus after 400ms with the label
  a11y      aria-label always; tooltip is not the only label
  used on   S04, S05, S06, S10, S20
```

```
Input / Textarea
  height    32px (md), 40px (lg); border border-input; radius sm; bg bg; px 12
  states    default, hover (border-strong), focus (border focus + ring), invalid (border danger + message under,
            aria-invalid, aria-describedby), disabled (bg surface), read-only
  extras    leading icon (search), clear button, character count for long text
  dir       dir="auto" on free text so mixed Arabic/English input aligns to its first strong character
  used on   S01, S06, S07, S10, S16, S23, S24
```

```
Select / Combobox
  base      Radix Select (short lists) and cmdk Combobox (searchable: people, boards, columns)
  states    closed, open, highlighted option, selected (check icon at end), empty search ("لا توجد نتائج")
  keyboard  arrows, Enter, Esc, type-ahead
  used on   S06, S08, S23, S24
```

```
Checkbox / Switch / Radio
  size      16px box, 32x18 switch; checked bg accent
  states    unchecked, checked, indeterminate (checkbox), disabled, focus ring
  used on   S05 row select, S08 checkbox cell, S21 automation toggles, settings
```

```
Avatar / AvatarStack
  sizes     20 (cells), 24 (lists), 32 (header), 40 (profile)
  content   photo, else initials on a colour picked from the label palette by user id (stable)
  stack     overlap 6px, max 3 then "+N" chip; tooltip lists names
  empty     dashed circle with user-plus icon = unassigned
  used on   S05 people cells, S10, S19, S20, S23, S24
```

```
Badge / Count
  variants  neutral (surface + text-muted), accent, danger (unread count)
  size      18px tall, text xs, pill
  used on   S04 inbox count, S12 lane counts, S20
```

```
Tooltip
  delay 400ms in, 0 out; bg text, color bg (inverted); text xs; max-width 240; never holds the only label
```

```
Popover
  base      Radix Popover; surface-raised, shadow pop, radius md, border border
  placement start-aligned under the trigger, flips at viewport edges, respects RTL
  close     Esc, click outside, selecting a value (for single-value editors)
  used on   S06 filters, S08 all cell editors, S09
```

```
Menu (dropdown / context)
  items     icon 16 + label + optional shortcut at end; separators; danger items in danger colour last
  keyboard  arrows, Enter, Esc, type-ahead; right-click on rows opens the same menu
  used on   S04 tree items, S05 group/column/item menus, S10
```

```
Modal (Dialog)
  sizes     sm 400, md 560, lg 800, full-screen under 640px
  parts     title, body, footer actions (primary at start in RTL reading order = right side)
  focus     trapped; returns to trigger on close; Esc closes unless a destructive confirm is mid-action
  used on   S07 column center, S23 share, S24 invite, S26 import, delete confirms
```

```
SidePanel (item card)
  width     item-panel-width 560 on desktop, full screen under 768
  side      slides in from the end side (left in Arabic, right in English); shadow panel
  parts     header (item name editable, board > group breadcrumb, close), tabs, body
  states    loading (skeleton), loaded, item deleted ("This item was deleted" + undo), no access
  url       /boards/:id/items/:itemId so it can be shared and reopened
  used on   S10, S31
```

```
Tabs
  style     underline 2px accent on active, text-muted inactive; overflow scrolls with fade at edges
  keyboard  arrow keys move between tabs (roving tabindex)
  used on   S05 view tabs, S10, S21
```

```
Toast
  variants  success, error, info, undo ("تم حذف العنصر · تراجع")
  place     bottom, centered; stack max 3; auto-dismiss 5s (undo 8s); pause on hover/focus
  a11y      role=status (info/success), role=alert (error)
  used on   all
```

```
Skeleton
  surface-hover blocks with a slow shimmer (off under reduced motion); shaped like the real content
  used on   S05 rows while a group loads, S10, S18, S19, S20
```

```
EmptyState
  parts     icon (Lucide, 40px, text-subtle), one-line title, one-line help, one primary action
  copy      our own, written per screen (see the copy list at the end)
  used on   S03, S05 (empty board/group), S12 (empty lane), S19, S20, search with no results
```

---

## Board

```
BoardHeader
  height    board-header-height 104 (title row + toolbar row)
  parts     board name (inline editable, xl), description toggle, favourite star, members avatar stack,
            "دعوة" (invite) button, board menu; second row: ViewTabs + "+" add view
  states    owner (all controls), editor (no settings), viewer (read-only badge), guest (shared badge)
  used on   S05, S12-S17
```

```
BoardToolbar
  parts     primary "عنصر جديد" (new item, uses board item_noun), search input (expands on focus),
            person filter (avatar picker), filter, sort, hide columns, group by, more
  active    any active filter turns its button accent and shows a count; one "clear all" link
  narrow    under 768 only new item, search and a "filters" sheet remain
  used on   S06
```

```
BoardTable
  layout    CSS grid; first column (item name, name-column-width 320) sticky to the start side;
            header row sticky to the top; horizontal scroll inside the board only
  rows      row-height 36 (compact 32 setting); virtualised; 1px border-b border between rows,
            1px border between cells; hover surface-hover; selected surface-selected
  row parts drag handle (on hover, start edge), checkbox, group colour bar (4px, start edge),
            name cell with subitem expander and update-count bubble, then one cell per column
  footer    per group: sum/avg/count per numbers column, status distribution bar per status column
  states    loading (skeleton rows), empty group ("أضف أول عنصر"), filtered to nothing
            ("لا توجد عناصر تطابق الفلتر · مسح الفلتر"), read-only (no handles, no add row)
  keyboard  arrows move a cell focus ring, Enter edits, Esc cancels, Tab next cell, Delete clears,
            Ctrl/Cmd+Z undo, Shift+Enter new item below
  a11y      role=grid with aria-rowcount for virtualisation; each cell role=gridcell with the column title
  used on   S05, S11, S28-S30
```

```
GroupHeader
  height    group-header-height 40
  parts     collapse chevron, title (lg/600 in the group colour, inline editable), item count, menu
  colour    from the label palette; 4px bar continues down every row of the group
  collapsed one line: title, count, mini status distribution bar
  states    default, collapsed, dragging, editing title
  used on   S05
```

```
AddItemRow
  last row of each group: "+ أضف عنصر" input; Enter adds and keeps focus for the next one
```

```
ColumnHeader
  parts     title (inline editable on double click), type icon, menu (sort, filter by, rename, settings,
            duplicate, delete), resize handle at the end edge, drag to reorder
  width     column-width-default 160, min 60, max 800
  used on   S05
```

```
ColumnCenter (modal)
  grid of column types: icon, name, one-line description; search; groups: essentials, people & time,
  numbers & text, files & links
  used on   S07
```

```
SubitemsTable
  nested BoardTable, indented 32px from the start, own header row with subitem columns,
  lighter header (surface), max one level deep
  used on   S11
```

---

## Cells and editors (one renderer + one editor per column type)

Shared: cell padding 8, text sm, content centred for pills and avatars, start-aligned for text.
Empty cell shows nothing until hover, then a faint "+" (except status: empty label colour).
Editors open in a Popover anchored to the cell; changes save on select (single-value) or on close.

```
StatusCell (status, priority, label)
  display   full-cell colour fill from the label palette, label centred, on-label or on-label-dark text,
            weight 500; empty = label-empty, no text
  editor    popover grid of labels (2 columns), each a coloured button; "تعديل التسميات" link opens
            LabelEditor; keyboard: arrows + Enter, number keys 1-9 pick by position
  done      labels flagged done count toward group progress and My Work completion
  used on   S05, S12 (lane header), S30
```

```
LabelEditor
  list of labels: colour swatch (opens palette of 12), name input, "done" toggle, drag to reorder, delete
  (asks where to move items that use it); add label; max 40 labels
  used on   S09
```

```
PeopleCell     AvatarStack; editor = Combobox of account members with search, "assign me" shortcut, multi
DateCell       localized short date ("20 نوفمبر"), red text-danger when overdue and status not done;
               editor = calendar (week starts Saturday for ar-AE, Monday for en), quick picks
               (اليوم، غدًا، الأسبوع القادم), clear
TimelineCell   bar showing elapsed share in accent; "1–20 نوفمبر"; editor = range calendar
TextCell       single line, truncated with title tooltip; edits inline (no popover)
LongTextCell   first line + "…"; editor = popover textarea 320x200
NumbersCell    end-aligned in LTR and RTL (numbers align right in both), unit prefix/suffix (AED, قطعة),
               thousands separators per locale; edits inline, rejects non-numeric with a shake + message
DropdownCell   chips (surface-hover bg, text, radius xs); editor = Combobox with create-new option
FilesCell      file-type icons, count; editor = popover list + upload (drag-drop, camera on mobile)
PhoneCell      flag + number in LTR span; tap to call on mobile; WhatsApp icon shortcut (our addition)
CheckboxCell   centred checkbox; toggles on click/Space
LinkCell / EmailCell  text with external-link icon; editor = URL + label inputs / email input
```

---

## Views

```
KanbanView
  lanes     one per label of the chosen status column, in label order, flowing from the start side;
            lane header = coloured strip + label + count; collapse lane
  card      surface-raised, radius md, shadow card, padding 12: name (md), up to 4 chosen column values,
            avatar stack, update count
  drag      cards between lanes (writes the status cell) and within a lane (position);
            keyboard drag with Space + arrows via dnd-kit sensors
  empty     lane shows a dashed drop area "اسحب هنا"
  used on   S12, S30
```

```
CalendarView
  month grid (default) and week; first day per locale; items placed by the chosen date column, chip
  coloured by status; "+N more" overflow; drag a chip to another day writes the date
  used on   S13
```

---

## Shell

```
TopBar
  height 48; app switcher/logo slot at start, global search (Cmd/Ctrl+K), inbox bell with Badge,
  My Work icon, help, avatar menu (profile, language ar/en, theme light/dark/system, sign out)
  used on   all
```

```
Sidebar
  width 256 (collapses to 56 icon rail, and to a drawer under 1024)
  parts     workspace switcher, Home, My Work, then tree: folders > boards/dashboards/docs with type icons,
            "+" new menu (board, folder, import), search within workspace
  tree      drag to reorder and move into folders; active item surface-selected + accent text
  states    expanded, collapsed, drawer, empty workspace ("أنشئ أول لوحة")
  used on   S04
```

```
CommandPalette (Cmd/Ctrl+K)
  search boards, items, people; recent; actions ("لوحة جديدة", "ادعُ زميلًا")
```

---

## Collaboration

```
UpdateComposer
  rich text (bold, italic, lists, links, code), @mention popover (account members, filtered by board access,
  warns when the person cannot see the board), attach files, emoji; Ctrl/Cmd+Enter sends
  states    empty, typing, sending, failed (retry)
  dir       dir="auto" per paragraph
  used on   S10
```

```
UpdateCard
  avatar, name, relative time ("منذ ٥ دقائق", absolute on hover), body, attachments grid, reactions (like),
  reply thread (collapsed after 2), menu (edit within 24h shows "edited", delete, copy link)
  used on   S10
```

```
NotificationRow
  unread dot (accent), actor avatar, sentence ("أحمد ذكرك في «علب عطور»"), item/board breadcrumb, time,
  mark read on open; filters: all, unread, mentions, assigned
  used on   S20
```

```
MyWorkList
  groups: متأخر (overdue), اليوم, هذا الأسبوع, لاحقًا, بدون تاريخ, تم; each row = item, board, status pill, date
  used on   S19
```

---

## Mobile (phase 4, Expo) — mapped now so the web components carry over

Tab bar (Home, My Work, Inbox, Search, Me), board as a list of cards grouped by group (not a grid),
status changed from a bottom sheet, item card full screen, camera upload in FilesCell, 44px hit sizes,
safe areas. Same tokens through a generated `tokens.ts`.

---

## Copy list (all fresh, Arabic default)

| key | ar | en |
| --- | --- | --- |
| new_item | عنصر جديد | New item |
| add_item | + أضف عنصر | + Add item |
| new_group | مجموعة جديدة | New group |
| empty_board | اللوحة فاضية. أضف أول عنصر وابدأ. | This board is empty. Add your first item. |
| empty_filter | لا توجد عناصر تطابق الفلتر | Nothing matches this filter |
| clear_filters | مسح الفلاتر | Clear filters |
| empty_inbox | مفيش إشعارات جديدة | You're all caught up |
| empty_mywork | مفيش حاجة متكلّف بيها دلوقتي | Nothing assigned to you right now |
| invite | دعوة | Invite |
| deleted_undo | تم الحذف · تراجع | Deleted · Undo |
| edit_labels | تعديل التسميات | Edit labels |
| status_default | قيد التنفيذ / تم / متوقف | In progress / Done / Blocked |
| overdue | متأخر | Overdue |
| read_only | للعرض فقط | View only |

Arabic copy uses a light Gulf/Egyptian-neutral register for the Tafseel build; a formal MSA set is a locale variant for selling.
