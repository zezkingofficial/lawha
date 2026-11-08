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
