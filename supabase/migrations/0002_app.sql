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
