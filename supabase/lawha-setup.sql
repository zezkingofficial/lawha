-- Lawha database setup for Supabase (fresh project). Paste into SQL Editor and Run, once.
-- migrations 0001 + 0002 + 0003 + 0004

-- Phase 1 schema: workspaces, boards, groups, items, subitems, typed columns,
-- views, updates, files, notifications, permissions. Postgres 15+ on Supabase.
-- Access control: row level security on every table, through the helper
-- functions in the "app" schema. Supabase provides auth.users and auth.uid().

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------- tenants

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  default_locale text not null default 'ar' check (default_locale in ('ar','en')),
  plan text not null default 'internal' check (plan in ('internal','free','basic','standard','pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  locale text not null default 'ar' check (locale in ('ar','en')),
  timezone text not null default 'Asia/Dubai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table account_members (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('admin','member','viewer','guest')),
  title text,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index on account_members (user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin','member','viewer','guest')),
  board_id uuid, -- guests are invited to one board; fk added below
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index on invitations (account_id);
create unique index invitations_open_once on invitations (account_id, lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------- structure

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'open' check (kind in ('open','closed')),
  icon text,
  position text collate "C" not null default 'a0',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on workspaces (account_id, position);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  primary key (workspace_id, user_id)
);
create index on workspace_members (user_id);

create table folders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_folder_id uuid references folders(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  color text,
  position text collate "C" not null default 'a0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_folder_id is distinct from id)
);
create index on folders (workspace_id, parent_folder_id, position);

create table boards (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  description text not null default '',
  kind text not null default 'main' check (kind in ('main','shareable','private')),
  item_noun text not null default 'item',          -- "order", "task", shown in the UI
  position text collate "C" not null default 'a0',
  created_by uuid references profiles(id) on delete set null,
  deleted_at timestamptz,                          -- trash; purged after 30 days
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on boards (workspace_id, folder_id, position) where deleted_at is null;
create index on boards (account_id);

alter table invitations
  add constraint invitations_board_fk foreign key (board_id) references boards(id) on delete cascade;

create table board_members (
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  primary key (board_id, user_id)
);
create index on board_members (user_id);

create table groups (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  color text not null default 'blue',
  position text collate "C" not null default 'a0',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on groups (board_id, position) where deleted_at is null;

-- Column types built in phase 1. Later phases add to this list.
create table columns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  scope text not null default 'item' check (scope in ('item','subitem')),
  title text not null check (length(title) between 1 and 120),
  type text not null check (type in (
    'status','priority','label','people','date','timeline','text','long_text',
    'numbers','dropdown','files','phone','checkbox','link','email'
  )),  -- the same list the app's ColumnType allows (lawha/src/lib/data/types.ts)
  -- per type: status/priority/label {labels:[{id,name,color,done}]},
  -- dropdown {options:[{id,name}], multi}, numbers {unit, unit_position, decimals}
  settings jsonb not null default '{}',
  position text collate "C" not null default 'a0',
  width int not null default 160 check (width between 60 and 800),
  is_protected boolean not null default false,     -- CRM core columns, phase 3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on columns (board_id, scope, position);

-- One row per item or subitem. Cell values live in "vals", keyed by column id,
-- shape set by the column type (see architecture.md). Written cell by cell
-- through app.set_cell so two people editing different cells never overwrite
-- each other.
create table items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  parent_item_id uuid references items(id) on delete cascade,
  name text not null check (length(name) between 1 and 500),
  vals jsonb not null default '{}',
  search_text text not null default '',
  position text collate "C" not null default 'a0',
  created_by uuid references profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a top-level item sits in a group; a subitem sits under a parent, not a group
  constraint item_place check (
    (parent_item_id is null and group_id is not null) or
    (parent_item_id is not null and group_id is null)
  )
);
create index on items (board_id, group_id, position) where deleted_at is null and parent_item_id is null;
create index on items (parent_item_id, position) where deleted_at is null;
create index on items (account_id);
create index items_search on items using gin (search_text gin_trgm_ops);
create index items_vals on items using gin (vals jsonb_path_ops);

-- Kept in sync from people columns by trigger. Powers My Work and assignment
-- notifications without scanning json.
create table item_assignees (
  item_id uuid not null references items(id) on delete cascade,
  column_id uuid not null references columns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  primary key (item_id, column_id, user_id)
);
create index on item_assignees (user_id, account_id);

create table views (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  type text not null check (type in ('table','kanban','calendar')),
  name text not null check (length(name) between 1 and 80),
  -- {filters:[...], sort:[...], hidden_column_ids:[...], group_by_column_id,
  --  kanban_column_id, date_column_id}
  settings jsonb not null default '{}',
  owner_id uuid references profiles(id) on delete cascade, -- null = shared view
  is_main boolean not null default false,
  position text collate "C" not null default 'a0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on views (board_id, position);
create unique index one_main_view on views (board_id) where is_main;

-- ---------------------------------------------------------------- collaboration

create table updates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  parent_update_id uuid references updates(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body jsonb not null,                              -- rich text document
  body_text text not null default '',               -- plain text for search and emails
  mentioned_user_ids uuid[] not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on updates (item_id, created_at);
create index on updates (parent_update_id);

create table assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  update_id uuid references updates(id) on delete cascade,
  storage_path text not null unique,                -- {account}/{board}/{uuid}-{name}
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 104857600), -- 100 MB
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on assets (item_id);
create index on assets (update_id);
create index on assets (board_id);

create table subscriptions (
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index on subscriptions (item_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('mention','assigned','update','invite')),
  actor_id uuid references profiles(id) on delete set null,
  board_id uuid references boards(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  update_id uuid references updates(id) on delete cascade,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
create index notifications_to_email on notifications (created_at) where read_at is null and emailed_at is null;

create table activity_log (
  id bigint generated always as identity primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,       -- item_created, cell_changed, item_moved, item_deleted, ...
  column_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log (board_id, created_at desc);
create index on activity_log (item_id, created_at desc);

-- ---------------------------------------------------------------- access helpers

create or replace function app.account_role(acc uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from account_members where account_id = acc and user_id = auth.uid()
$$;

-- reads workspaces without RLS, so the workspace_members policy can use it
-- without looping back through the workspaces policy
create or replace function app.workspace_account(ws uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from workspaces where id = ws
$$;

create or replace function app.can_read_board(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from boards bo
    join workspaces w on w.id = bo.workspace_id
    join account_members am on am.account_id = bo.account_id and am.user_id = auth.uid()
    where bo.id = b
      and (
        -- guests and private boards: explicit board membership only
        exists (select 1 from board_members bm where bm.board_id = bo.id and bm.user_id = auth.uid())
        or (
          am.role <> 'guest' and bo.kind <> 'private'
          and (w.kind = 'open' or am.role = 'admin'
               or exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = auth.uid()))
        )
      )
  )
$$;

create or replace function app.can_edit_board(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.can_read_board(b) and exists (
    select 1
    from boards bo
    join account_members am on am.account_id = bo.account_id and am.user_id = auth.uid()
    left join board_members bm on bm.board_id = bo.id and bm.user_id = auth.uid()
    where bo.id = b
      and am.role <> 'viewer'
      and coalesce(bm.role, 'editor') <> 'viewer'
  )
$$;

create or replace function app.can_admin_board(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from boards bo
    join account_members am on am.account_id = bo.account_id and am.user_id = auth.uid()
    where bo.id = b
      and (am.role = 'admin'
           or bo.created_by = auth.uid()
           or exists (select 1 from board_members bm where bm.board_id = bo.id and bm.user_id = auth.uid() and bm.role = 'owner'))
  )
$$;

-- ---------------------------------------------------------------- write paths

-- Set one cell. Atomic per cell: concurrent edits to other cells of the same
-- item are kept. Validates the value shape for the column type.
create or replace function app.set_cell(p_item uuid, p_column uuid, p_value jsonb)
returns items language plpgsql security invoker set search_path = public as $$
declare
  col columns;
  it items;
begin
  select * into col from columns where id = p_column;
  if col.id is null then raise exception 'column not found'; end if;

  if p_value is not null and p_value <> 'null'::jsonb then
    case col.type
      when 'status','priority','label' then
        if not (p_value ? 'label_id') then raise exception 'status value needs label_id'; end if;
      when 'people' then
        if jsonb_typeof(p_value->'user_ids') <> 'array' then raise exception 'people value needs user_ids[]'; end if;
      when 'date' then
        perform (p_value->>'date')::date;
      when 'timeline' then
        if (p_value->>'from')::date > (p_value->>'to')::date then raise exception 'timeline from after to'; end if;
      when 'numbers' then
        perform (p_value->>'number')::numeric;
      when 'checkbox' then
        if jsonb_typeof(p_value->'checked') <> 'boolean' then raise exception 'checkbox value needs checked'; end if;
      when 'dropdown' then
        if jsonb_typeof(p_value->'option_ids') <> 'array' then raise exception 'dropdown value needs option_ids[]'; end if;
      when 'phone' then
        if coalesce(p_value->>'phone', '') !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'phone number looks wrong'; end if;
      when 'email' then
        if coalesce(p_value->>'email', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email looks wrong'; end if;
      when 'link' then
        if coalesce(p_value->>'url', '') !~ '^https?://' then raise exception 'link must start with http:// or https://'; end if;
      when 'files' then
        if jsonb_typeof(p_value->'asset_ids') <> 'array' then raise exception 'files value needs asset_ids[]'; end if;
      when 'text', 'long_text' then
        if jsonb_typeof(p_value->'text') <> 'string' then raise exception 'text value needs text'; end if;
      else null;
    end case;
  end if;

  update items
     set vals = case when p_value is null or p_value = 'null'::jsonb
                     then vals - p_column::text
                     else jsonb_set(vals, array[p_column::text], p_value, true) end,
         updated_at = now()
   where id = p_item and board_id = col.board_id and deleted_at is null
  returning * into it;

  if it.id is null then raise exception 'item not found or not editable'; end if;
  return it;
end $$;

-- Keep search_text, item_assignees and the activity log in step with items.
create or replace function app.items_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c record;
  old_v jsonb;
  new_v jsonb;
begin
  if tg_op = 'INSERT' then
    insert into activity_log (account_id, board_id, item_id, actor_id, action, after)
    values (new.account_id, new.board_id, new.id, auth.uid(), 'item_created', jsonb_build_object('name', new.name));
    insert into subscriptions (user_id, item_id)
    select new.created_by, new.id where new.created_by is not null
    on conflict do nothing;
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      insert into activity_log (account_id, board_id, item_id, actor_id, action)
      values (new.account_id, new.board_id, new.id, auth.uid(), 'item_deleted');
    end if;
    if new.group_id is distinct from old.group_id then
      insert into activity_log (account_id, board_id, item_id, actor_id, action, before, after)
      values (new.account_id, new.board_id, new.id, auth.uid(), 'item_moved',
              to_jsonb(old.group_id), to_jsonb(new.group_id));
    end if;
    if new.name is distinct from old.name then
      insert into activity_log (account_id, board_id, item_id, actor_id, action, before, after)
      values (new.account_id, new.board_id, new.id, auth.uid(), 'name_changed', to_jsonb(old.name), to_jsonb(new.name));
    end if;
    if new.vals is distinct from old.vals then
      for c in select id, type from columns where board_id = new.board_id loop
        old_v := old.vals -> c.id::text;
        new_v := new.vals -> c.id::text;
        if old_v is distinct from new_v then
          insert into activity_log (account_id, board_id, item_id, actor_id, action, column_id, before, after)
          values (new.account_id, new.board_id, new.id, auth.uid(), 'cell_changed', c.id, old_v, new_v);
        end if;
      end loop;
    end if;
  end if;

  -- people columns -> item_assignees (new rows fire the assigned notification)
  if tg_op = 'INSERT' or new.vals is distinct from old.vals then
    delete from item_assignees ia
     where ia.item_id = new.id
       and not exists (
         select 1 from columns c2,
           jsonb_array_elements_text(coalesce(new.vals -> c2.id::text -> 'user_ids', '[]')) u(uid)
         where c2.board_id = new.board_id and c2.type = 'people'
           and c2.id = ia.column_id and u.uid::uuid = ia.user_id);
    insert into item_assignees (item_id, column_id, user_id, account_id)
    select new.id, c2.id, u.uid::uuid, new.account_id
      from columns c2,
           jsonb_array_elements_text(coalesce(new.vals -> c2.id::text -> 'user_ids', '[]')) u(uid)
     where c2.board_id = new.board_id and c2.type = 'people'
    on conflict do nothing;
  end if;
  return null;
end $$;

create or replace function app.items_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  -- searchable text: the name plus every text-like cell value
  new.search_text := lower(new.name || ' ' || coalesce((
    select string_agg(v, ' ')
      from jsonb_each(new.vals) e(k, val),
           lateral (select coalesce(val->>'text', val->>'number', val->>'phone', val->>'url', val->>'email', '') as v) x
  ), ''));
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  -- a subitem inherits its board and account from its parent
  if new.parent_item_id is not null then
    select board_id, account_id into new.board_id, new.account_id from items where id = new.parent_item_id;
  end if;
  return new;
end $$;

create trigger items_before before insert or update on items
  for each row execute function app.items_before_write();
create trigger items_after after insert or update on items
  for each row execute function app.items_after_write();

create or replace function app.assignee_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare it items;
begin
  if new.user_id = auth.uid() then return null; end if;
  select * into it from items where id = new.item_id;
  insert into notifications (account_id, user_id, kind, actor_id, board_id, item_id)
  values (new.account_id, new.user_id, 'assigned', auth.uid(), it.board_id, it.id);
  insert into subscriptions (user_id, item_id) values (new.user_id, new.item_id) on conflict do nothing;
  return null;
end $$;

create trigger item_assignees_notify after insert on item_assignees
  for each row execute function app.assignee_notify();

-- A new update notifies people mentioned (kind mention) and everyone
-- subscribed to the item (kind update), never the author, never twice.
create or replace function app.update_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (account_id, user_id, kind, actor_id, board_id, item_id, update_id)
  select new.account_id, u, 'mention', new.author_id, new.board_id, new.item_id, new.id
    from unnest(new.mentioned_user_ids) u
   where u is distinct from new.author_id
     and exists (select 1 from account_members am where am.account_id = new.account_id and am.user_id = u);

  insert into notifications (account_id, user_id, kind, actor_id, board_id, item_id, update_id)
  select new.account_id, s.user_id, 'update', new.author_id, new.board_id, new.item_id, new.id
    from subscriptions s
   where s.item_id = new.item_id
     and s.user_id is distinct from new.author_id
     and not (s.user_id = any(new.mentioned_user_ids));

  insert into subscriptions (user_id, item_id)
  select new.author_id, new.item_id where new.author_id is not null
  on conflict do nothing;
  return null;
end $$;

create trigger updates_notify after insert on updates
  for each row execute function app.update_notify();

-- Create a board with a main table view, one group and default columns.
create or replace function app.create_board(p_workspace uuid, p_name text, p_kind text default 'main')
returns boards language plpgsql security invoker set search_path = public as $$
declare
  ws workspaces;
  b boards;
begin
  select * into ws from workspaces where id = p_workspace;
  if ws.id is null then raise exception 'workspace not found'; end if;
  if app.account_role(ws.account_id) not in ('admin','member') then raise exception 'not allowed'; end if;

  insert into boards (account_id, workspace_id, name, kind, created_by)
  values (ws.account_id, ws.id, p_name, p_kind, auth.uid()) returning * into b;
  insert into board_members (board_id, user_id, role) values (b.id, auth.uid(), 'owner');
  insert into groups (account_id, board_id, title, color, position) values (ws.account_id, b.id, 'New group', 'blue', 'a0');
  insert into columns (account_id, board_id, title, type, settings, position) values
    (ws.account_id, b.id, 'Owner', 'people', '{}', 'a0'),
    (ws.account_id, b.id, 'Status', 'status',
      '{"labels":[{"id":"working","name":"Working on it","color":"orange","done":false},
                  {"id":"done","name":"Done","color":"green","done":true},
                  {"id":"stuck","name":"Stuck","color":"red","done":false}]}', 'a1'),
    (ws.account_id, b.id, 'Date', 'date', '{}', 'a2');
  insert into views (account_id, board_id, type, name, is_main) values (ws.account_id, b.id, 'table', 'Main table', true);
  return b;
end $$;

-- ---------------------------------------------------------------- row level security

alter table accounts enable row level security;
alter table profiles enable row level security;
alter table account_members enable row level security;
alter table invitations enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table folders enable row level security;
alter table boards enable row level security;
alter table board_members enable row level security;
alter table groups enable row level security;
alter table columns enable row level security;
alter table items enable row level security;
alter table item_assignees enable row level security;
alter table views enable row level security;
alter table updates enable row level security;
alter table assets enable row level security;
alter table subscriptions enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;

create policy accounts_read on accounts for select using (app.account_role(id) is not null);
create policy accounts_admin on accounts for update using (app.account_role(id) = 'admin');

create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from account_members a join account_members b on a.account_id = b.account_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_self on profiles for update using (id = auth.uid());

create policy members_read on account_members for select using (app.account_role(account_id) is not null);
create policy members_admin on account_members for all
  using (app.account_role(account_id) = 'admin') with check (app.account_role(account_id) = 'admin');

create policy invitations_admin on invitations for all
  using (app.account_role(account_id) = 'admin') with check (app.account_role(account_id) = 'admin');

create policy workspaces_read on workspaces for select using (
  app.account_role(account_id) in ('admin','member','viewer')
  and (kind = 'open' or app.account_role(account_id) = 'admin'
       or exists (select 1 from workspace_members wm where wm.workspace_id = workspaces.id and wm.user_id = auth.uid())));
create policy workspaces_write on workspaces for all
  using (app.account_role(account_id) in ('admin','member'))
  with check (app.account_role(account_id) in ('admin','member'));

create policy workspace_members_read on workspace_members for select using (
  app.account_role(app.workspace_account(workspace_id)) is not null);
create policy workspace_members_write on workspace_members for all using (
  app.account_role(app.workspace_account(workspace_id)) = 'admin');

create policy folders_read on folders for select using (app.account_role(account_id) in ('admin','member','viewer'));
create policy folders_write on folders for all
  using (app.account_role(account_id) in ('admin','member'))
  with check (app.account_role(account_id) in ('admin','member'));

-- created_by lets "insert ... returning" see the new row before the helper can
create policy boards_read on boards for select using (created_by = auth.uid() or app.can_read_board(id));
create policy boards_insert on boards for insert with check (app.account_role(account_id) in ('admin','member'));
create policy boards_update on boards for update using (app.can_admin_board(id));
create policy boards_delete on boards for delete using (app.can_admin_board(id));

create policy board_members_read on board_members for select using (app.can_read_board(board_id));
create policy board_members_write on board_members for all
  using (app.can_admin_board(board_id)) with check (app.can_admin_board(board_id));

create policy groups_read on groups for select using (app.can_read_board(board_id));
create policy groups_write on groups for all
  using (app.can_edit_board(board_id)) with check (app.can_edit_board(board_id));

create policy columns_read on columns for select using (app.can_read_board(board_id));
create policy columns_write on columns for all
  using (app.can_edit_board(board_id) and not is_protected)
  with check (app.can_edit_board(board_id));

create policy items_read on items for select using (app.can_read_board(board_id));
create policy items_write on items for all
  using (app.can_edit_board(board_id)) with check (app.can_edit_board(board_id));

create policy assignees_read on item_assignees for select using (
  exists (select 1 from items i where i.id = item_id and app.can_read_board(i.board_id)));

create policy views_read on views for select using (
  app.can_read_board(board_id) and (owner_id is null or owner_id = auth.uid()));
create policy views_write on views for all
  using (app.can_edit_board(board_id) and (owner_id is null or owner_id = auth.uid()))
  with check (app.can_edit_board(board_id) and (owner_id is null or owner_id = auth.uid()));

create policy updates_read on updates for select using (app.can_read_board(board_id));
create policy updates_insert on updates for insert with check (
  author_id = auth.uid() and app.can_read_board(board_id)
  and app.account_role(account_id) <> 'viewer');
create policy updates_own on updates for update using (author_id = auth.uid());
create policy updates_delete on updates for delete using (author_id = auth.uid() or app.can_admin_board(board_id));

create policy assets_read on assets for select using (app.can_read_board(board_id));
create policy assets_write on assets for insert with check (app.can_edit_board(board_id) and uploaded_by = auth.uid());
create policy assets_delete on assets for delete using (uploaded_by = auth.uid() or app.can_admin_board(board_id));

create policy subscriptions_own on subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_mark on notifications for update using (user_id = auth.uid());

create policy activity_read on activity_log for select using (app.can_read_board(board_id));

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- 0002: what the app needs on top of 0001 (replica/schema.sql) to run on Supabase.
-- Run 0001 then this file, in the Supabase SQL Editor, once.

-- ---------------------------------------------------------------- profiles from auth

alter table profiles add column if not exists color text not null default 'teal'
  check (color in ('green','orange','red','blue','purple','teal','pink','navy','brown','grey','yellow','lime'));

create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare palette text[] := array['teal','purple','orange','navy','pink','blue','brown','green'];
begin
  insert into profiles (id, full_name, color)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
          palette[1 + abs(hashtext(new.id::text)) % array_length(palette, 1)])
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------- boards: editors rename, owners share

-- editors may rename and describe a board; only owners/admins may change who sees it
drop policy if exists boards_update on boards;
create policy boards_update on boards for update using (app.can_edit_board(id)) with check (app.can_edit_board(id));

create or replace function app.boards_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.kind is distinct from old.kind or new.deleted_at is distinct from old.deleted_at or new.workspace_id is distinct from old.workspace_id)
     and not app.can_admin_board(old.id) then
    raise exception 'only the board owner or an admin can change sharing' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists boards_guard on boards;
create trigger boards_guard before update on boards for each row execute function app.boards_guard();

-- a board always keeps at least one owner
create or replace function app.keep_one_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from boards where id = old.board_id)
     and not exists (select 1 from board_members where board_id = old.board_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'a board needs at least one owner';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists keep_one_owner on board_members;
create trigger keep_one_owner before update or delete on board_members for each row execute function app.keep_one_owner();

-- ---------------------------------------------------------------- views: personal views for people who cannot edit

drop policy if exists views_write on views;
create policy views_insert on views for insert with check (
  (owner_id = auth.uid() and app.can_read_board(board_id)) or (owner_id is null and app.can_edit_board(board_id)));
create policy views_update on views for update using (
  (owner_id = auth.uid()) or (owner_id is null and app.can_edit_board(board_id)));
create policy views_delete on views for delete using (
  not is_main and ((owner_id = auth.uid()) or (owner_id is null and app.can_edit_board(board_id))));

-- groups also need deleting for undo purge; workspace rename by members already allowed

-- ---------------------------------------------------------------- column settings: removed labels/options leave no orphans

create or replace function app.update_column_settings(p_column uuid, p_settings jsonb)
returns columns language plpgsql security invoker set search_path = public as $$
declare
  c columns;
  keep text[];
begin
  if p_settings ? 'labels' and jsonb_array_length(p_settings->'labels') = 0 then
    raise exception 'a status column needs at least one label';
  end if;
  update columns set settings = settings || p_settings, updated_at = now() where id = p_column returning * into c;
  if c.id is null then raise exception 'column not found or not editable'; end if;
  select coalesce(array_agg(x->>'id'), '{}') into keep
    from jsonb_array_elements(coalesce(c.settings->'labels', '[]') || coalesce(c.settings->'options', '[]')) x;
  if c.type in ('status','priority','label') then
    update items set vals = vals - c.id::text
     where board_id = c.board_id and vals ? c.id::text and not ((vals->c.id::text->>'label_id') = any(keep));
  elsif c.type = 'dropdown' then
    update items i set vals = case when jsonb_array_length(f.left_ids) = 0 then i.vals - c.id::text
                                   else jsonb_set(i.vals, array[c.id::text], jsonb_build_object('option_ids', f.left_ids)) end
      from (select it.id, coalesce(jsonb_agg(o) filter (where o #>> '{}' = any(keep)), '[]') as left_ids
              from items it, jsonb_array_elements(it.vals->c.id::text->'option_ids') o
             where it.board_id = c.board_id and it.vals ? c.id::text
             group by it.id) f
     where i.id = f.id and jsonb_array_length(i.vals->c.id::text->'option_ids') <> jsonb_array_length(f.left_ids);
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------- new boards get a kanban too

create or replace function app.create_board(p_workspace uuid, p_name text, p_kind text default 'main')
returns boards language plpgsql security invoker set search_path = public as $$
declare
  ws workspaces;
  b boards;
begin
  select * into ws from workspaces where id = p_workspace;
  if ws.id is null then raise exception 'workspace not found'; end if;
  if app.account_role(ws.account_id) not in ('admin','member') then raise exception 'not allowed' using errcode = '42501'; end if;

  insert into boards (account_id, workspace_id, name, kind, created_by, item_noun)
  values (ws.account_id, ws.id, coalesce(nullif(trim(p_name), ''), 'لوحة جديدة'), p_kind, auth.uid(), 'عنصر') returning * into b;
  insert into board_members (board_id, user_id, role) values (b.id, auth.uid(), 'owner');
  insert into groups (account_id, board_id, title, color, position) values (ws.account_id, b.id, 'مجموعة جديدة', 'blue', 'a0');
  insert into columns (account_id, board_id, title, type, settings, position, width) values
    (ws.account_id, b.id, 'المسؤول', 'people', '{}', 'a0', 120),
    (ws.account_id, b.id, 'الحالة', 'status',
      '{"labels":[{"id":"working","name":"قيد التنفيذ","color":"orange","done":false},
                  {"id":"done","name":"تم","color":"green","done":true},
                  {"id":"stuck","name":"متوقف","color":"red","done":false}]}', 'a1', 150),
    (ws.account_id, b.id, 'التاريخ', 'date', '{}', 'a2', 120);
  insert into views (account_id, board_id, type, name, is_main, position) values
    (ws.account_id, b.id, 'table', 'الجدول الرئيسي', true, 'a0'),
    (ws.account_id, b.id, 'kanban', 'كانبان', false, 'a1');
  return b;
end $$;

-- ---------------------------------------------------------------- first sign-in: a company with a starting board

create or replace function app.bootstrap_account(p_company text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  acc uuid;
  ws uuid;
  b boards;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select account_id into acc from account_members where user_id = auth.uid() order by created_at limit 1;
  if acc is not null then return acc; end if;

  insert into accounts (name, slug) values (coalesce(nullif(trim(p_company), ''), 'شركتي'), 'acc-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12))
  returning id into acc;
  insert into account_members (account_id, user_id, role) values (acc, auth.uid(), 'admin');
  insert into workspaces (account_id, name, created_by) values (acc, 'المساحة الرئيسية', auth.uid()) returning id into ws;

  -- an orders board shaped for a packaging business; people can change all of it
  b := app.create_board(ws, 'طلبات العملاء');
  update boards set description = 'كل طلب من أول عرض السعر لحد التسليم', item_noun = 'طلب' where id = b.id;
  update groups set title = 'طلبات جديدة' where board_id = b.id;
  update columns set settings = '{"labels":[{"id":"quote","name":"عرض سعر","color":"grey","done":false},
      {"id":"design","name":"تصميم","color":"purple","done":false},{"id":"prod","name":"في الإنتاج","color":"orange","done":false},
      {"id":"stuck","name":"متوقف","color":"red","done":false},{"id":"ready","name":"جاهز","color":"blue","done":false},
      {"id":"done","name":"تم التسليم","color":"green","done":true}]}'
   where board_id = b.id and type = 'status';
  update columns set title = 'التسليم' where board_id = b.id and type = 'date';
  insert into columns (account_id, board_id, title, type, settings, position, width) values
    (acc, b.id, 'الكمية', 'numbers', '{"unit":"قطعة","unitPosition":"after"}', 'a3', 110),
    (acc, b.id, 'القيمة', 'numbers', '{"unit":"AED","unitPosition":"after"}', 'a4', 130),
    (acc, b.id, 'واتساب العميل', 'phone', '{}', 'a5', 160),
    (acc, b.id, 'ملاحظات', 'text', '{}', 'a6', 200);
  insert into views (account_id, board_id, type, name, is_main, position) values (acc, b.id, 'calendar', 'تقويم التسليم', false, 'a2');
  perform app.create_board(ws, 'خط الإنتاج');
  return acc;
end $$;

-- ---------------------------------------------------------------- invitations by link (shared on WhatsApp)

create or replace function app.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from invitations where token = p_token for update;
  if inv.id is null or inv.accepted_at is not null then raise exception 'this invitation link is not valid any more'; end if;
  if inv.expires_at < now() then raise exception 'this invitation link has expired'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email', '')) then raise exception 'this invitation was sent to a different email'; end if;
  insert into account_members (account_id, user_id, role) values (inv.account_id, auth.uid(), inv.role)
  on conflict (account_id, user_id) do nothing;
  if inv.board_id is not null then
    insert into board_members (board_id, user_id, role) values (inv.board_id, auth.uid(), 'editor') on conflict do nothing;
  end if;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.account_id;
end $$;

-- the invitee can read their own pending invitation before joining (to show the company name)
create or replace function app.invitation_preview(p_token text)
returns table (account_name text, role text, email text, expired boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select a.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null
    from invitations i join accounts a on a.id = i.account_id where i.token = p_token
$$;

-- ---------------------------------------------------------------- PostgREST only exposes "public": thin wrappers

create or replace function public.set_cell(p_item uuid, p_column uuid, p_value jsonb)
returns items language sql security invoker set search_path = public as $$ select app.set_cell(p_item, p_column, p_value) $$;
create or replace function public.create_board(p_workspace uuid, p_name text, p_kind text default 'main')
returns boards language sql security invoker set search_path = public as $$ select app.create_board(p_workspace, p_name, p_kind) $$;
create or replace function public.update_column_settings(p_column uuid, p_settings jsonb)
returns columns language sql security invoker set search_path = public as $$ select app.update_column_settings(p_column, p_settings) $$;
create or replace function public.bootstrap_account(p_company text)
returns uuid language sql security invoker set search_path = public as $$ select app.bootstrap_account(p_company) $$;
create or replace function public.accept_invitation(p_token text)
returns uuid language sql security invoker set search_path = public as $$ select app.accept_invitation(p_token) $$;
create or replace function public.invitation_preview(p_token text)
returns table (account_name text, role text, email text, expired boolean, used boolean)
language sql stable security invoker set search_path = public as $$ select * from app.invitation_preview(p_token) $$;

revoke execute on all functions in schema app from public, anon;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
revoke execute on function public.set_cell, public.create_board, public.update_column_settings, public.bootstrap_account, public.accept_invitation from public, anon;
grant execute on function public.set_cell, public.create_board, public.update_column_settings, public.bootstrap_account, public.accept_invitation, public.invitation_preview to authenticated;
grant execute on function public.invitation_preview to anon;

-- ---------------------------------------------------------------- files: private bucket, same access as the board

insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 104857600)
on conflict (id) do nothing;

-- object path: {account_id}/{board_id}/{random}-{file name}
drop policy if exists assets_read on storage.objects;
create policy assets_read on storage.objects for select to authenticated
  using (bucket_id = 'assets' and app.can_read_board(((storage.foldername(name))[2])::uuid));
drop policy if exists assets_write on storage.objects;
create policy assets_write on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and app.can_edit_board(((storage.foldername(name))[2])::uuid));
drop policy if exists assets_delete on storage.objects;
create policy assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and (owner = auth.uid() or app.can_admin_board(((storage.foldername(name))[2])::uuid)));

-- ---------------------------------------------------------------- realtime: board changes and my notifications

alter table items replica identity full;
alter table groups replica identity full;
alter table columns replica identity full;
alter table views replica identity full;
alter table updates replica identity full;
alter table board_members replica identity full;
alter table boards replica identity full;
alter table notifications replica identity full;

do $$
declare t text;
begin
  foreach t in array array['items','groups','columns','views','updates','board_members','boards','notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 0003: small fixes found while wiring the app to Supabase.

-- guests see the workspaces that hold a board shared with them (otherwise their sidebar is empty)
drop policy if exists workspaces_read on workspaces;
create policy workspaces_read on workspaces for select using (
  (app.account_role(account_id) in ('admin','member','viewer')
    and (kind = 'open' or app.account_role(account_id) = 'admin'
         or exists (select 1 from workspace_members wm where wm.workspace_id = workspaces.id and wm.user_id = auth.uid())))
  or exists (select 1 from boards b where b.workspace_id = workspaces.id and app.can_read_board(b.id)));

-- deleting a column removes its values from every item
create or replace function app.columns_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update items set vals = vals - old.id::text where board_id = old.board_id and vals ? old.id::text;
  return old;
end $$;
drop trigger if exists columns_after_delete on columns;
create trigger columns_after_delete after delete on columns for each row execute function app.columns_after_delete();

-- people in my company (with their role), for pickers and the team page
create or replace function public.account_people()
returns table (id uuid, full_name text, color text, role text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.full_name, p.color, am.role
    from account_members am join profiles p on p.id = am.user_id
   where am.account_id in (select account_id from account_members where user_id = auth.uid())
$$;
revoke execute on function public.account_people from public, anon;
grant execute on function public.account_people to authenticated;

-- 0004: someone opening an invitation link is not signed in yet, so the preview
-- must work for anonymous visitors. It only answers for a 48-character random token.
create or replace function public.invitation_preview(p_token text)
returns table (account_name text, role text, email text, expired boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select a.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null
    from invitations i join accounts a on a.id = i.account_id
   where i.token = p_token and length(p_token) >= 32
$$;
revoke execute on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

