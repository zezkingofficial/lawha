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
