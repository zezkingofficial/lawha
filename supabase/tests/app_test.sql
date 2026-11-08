-- Tests for 0002 on top of 0001. Run after supabase_stub.sql, 0001_init.sql, 0002_app.sql.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'ahmed@tafseel.test', '{"full_name":"أحمد"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'sara@tafseel.test', '{"full_name":"سارة"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@other.test', '{}');

do $$ begin
  if (select count(*) from profiles) <> 3 then raise exception 'FAIL: profiles not created from auth.users'; end if;
  if (select full_name from profiles where id = '00000000-0000-0000-0000-0000000000b1') <> 'owner' then raise exception 'FAIL: name fallback'; end if;
end $$;

set role authenticated;

-- Ahmed signs up: a company, a workspace, the orders board and a production board
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set request.jwt.claim.email = 'ahmed@tafseel.test';
select public.bootstrap_account('تفصيل بوكسز') as acc \gset
select public.bootstrap_account('again') = :'acc' as idempotent;
do $$ begin
  if (select count(*) from boards) <> 2 then raise exception 'FAIL: starter boards (%)', (select count(*) from boards); end if;
  if (select count(*) from columns c join boards b on b.id = c.board_id where b.name = 'طلبات العملاء') <> 7 then raise exception 'FAIL: orders columns'; end if;
  if (select count(*) from views v join boards b on b.id = v.board_id where b.name = 'طلبات العملاء') <> 3 then raise exception 'FAIL: orders views'; end if;
end $$;
select id as orders from boards where name = 'طلبات العملاء' \gset
select id as g from groups where board_id = :'orders' \gset
select id as st from columns where board_id = :'orders' and type = 'status' \gset
insert into items (account_id, board_id, group_id, name) values (:'acc', :'orders', :'g', 'علب عطور') returning id as it \gset
select (public.set_cell(:'it', :'st', '{"label_id":"stuck"}')).id is not null as cell_set;

-- removing a label clears values that used it
select (public.update_column_settings(:'st', (select jsonb_build_object('labels', jsonb_path_query_array(settings->'labels', '$[*] ? (@.id != "stuck")')) from columns where id = :'st'))).id is not null;
do $$ begin
  if exists (select 1 from items where vals ? (select id::text from columns where type = 'status' and title = 'الحالة' limit 1)) then
    raise exception 'FAIL: removed label still on an item'; end if;
end $$;
do $$ begin
  begin
    perform public.update_column_settings((select id from columns where type = 'status' limit 1), '{"labels":[]}');
    raise exception 'FAIL: empty labels accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- Ahmed invites Sara as a member
insert into invitations (account_id, email, role, invited_by) values (:'acc', 'Sara@tafseel.test', 'member', auth.uid()) returning token as tok \gset

-- the other company sees nothing and cannot use the invitation
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
set request.jwt.claim.email = 'owner@other.test';
select public.bootstrap_account('Other') as acc2 \gset
do $$ begin
  if exists (select 1 from boards b join accounts a on a.id = b.account_id where a.name = 'تفصيل بوكسز') then raise exception 'FAIL: cross-tenant board leak'; end if;
  if exists (select 1 from invitations) then raise exception 'FAIL: other company sees invitations'; end if;
end $$;
do $$ begin
  begin
    perform public.accept_invitation((select token from invitations limit 1));
  exception when others then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from account_members am join accounts a on a.id = am.account_id where a.name = 'تفصيل بوكسز' and am.user_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: wrong person joined through someone else''s invitation'; end if;
end $$;
set role authenticated;

-- Sara previews and accepts (email match is case-insensitive)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
set request.jwt.claim.email = 'sara@tafseel.test';
select account_name = 'تفصيل بوكسز' as preview_ok from public.invitation_preview(:'tok');
select public.accept_invitation(:'tok') = :'acc' as joined;
do $$ begin
  begin
    perform public.accept_invitation((select token from invitations where accepted_at is not null limit 1));
    raise exception 'FAIL: invitation reused';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- Sara (member, editor by default) can rename the board but not change who sees it
update boards set name = 'طلبات العملاء ٢٠٢٦' where id = :'orders';
do $$ begin
  if not exists (select 1 from boards where name = 'طلبات العملاء ٢٠٢٦') then raise exception 'FAIL: editor rename'; end if;
  begin
    update boards set kind = 'private' where name = 'طلبات العملاء ٢٠٢٦';
    raise exception 'FAIL: editor changed sharing';
  exception when insufficient_privilege then null; end;
end $$;

-- a viewer-level board member makes a personal view, not a shared one
reset role;
update board_members set role = 'owner' where board_id = (select id from boards where name = 'طلبات العملاء ٢٠٢٦') and user_id = '00000000-0000-0000-0000-0000000000a1';
insert into board_members (board_id, user_id, role) select id, '00000000-0000-0000-0000-0000000000a2', 'viewer' from boards where name = 'طلبات العملاء ٢٠٢٦';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into views (account_id, board_id, type, name, owner_id) values (:'acc', :'orders', 'table', 'عرضي', auth.uid());
do $$ begin
  begin
    insert into views (account_id, board_id, type, name, owner_id) values ((select account_id from boards limit 1), (select id from boards where name like 'طلبات%'), 'table', 'shared', null);
    raise exception 'FAIL: viewer created a shared view';
  exception when insufficient_privilege then null; end;
end $$;

-- the last owner cannot be removed
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    delete from board_members where user_id = '00000000-0000-0000-0000-0000000000a1' and board_id = (select id from boards where name like 'طلبات%');
    raise exception 'FAIL: last owner removed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- storage: Ahmed may upload to his board, the other company may not
insert into storage.objects (bucket_id, name, owner) values ('assets', :'acc' || '/' || :'orders' || '/x-proof.png', auth.uid());
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  if exists (select 1 from storage.objects) then raise exception 'FAIL: other company reads files'; end if;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('assets', (select name from storage.objects limit 1), auth.uid());
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'FAIL: storage write rule'; end if;
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') <> 8 then raise exception 'FAIL: realtime tables'; end if;
end $$;
select 'ALL APP TESTS PASSED' as result;
