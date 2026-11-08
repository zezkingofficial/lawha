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
