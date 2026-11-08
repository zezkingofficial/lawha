\set ON_ERROR_STOP on
-- guest workspace visibility + column delete cleanup (runs after app_test.sql in the same database)
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'client@guest.test');
insert into account_members (account_id, user_id, role) select id, '00000000-0000-0000-0000-0000000000c1', 'guest' from accounts where name = 'تفصيل بوكسز';
insert into board_members (board_id, user_id, role) select id, '00000000-0000-0000-0000-0000000000c1', 'editor' from boards where name = 'خط الإنتاج' and account_id = (select id from accounts where name = 'تفصيل بوكسز');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if (select count(*) from workspaces) <> 1 then raise exception 'FAIL: guest workspaces (%)', (select count(*) from workspaces); end if;
  if (select count(*) from boards) <> 1 then raise exception 'FAIL: guest boards'; end if;
  if (select count(*) from public.account_people()) <> 3 then raise exception 'FAIL: account_people (%)', (select count(*) from public.account_people()); end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into columns (account_id, board_id, title, type, position) select account_id, id, 'tmp', 'text', 'z0' from boards where name like 'طلبات%' returning id as tmpcol \gset
update items set vals = vals || jsonb_build_object(:'tmpcol', '{"text":"x"}'::jsonb);
delete from columns where id = :'tmpcol';
do $$ begin
  if exists (select 1 from items where vals ? (select current_setting('my.dummy', true))) then null; end if;
end $$;
select count(*) = 0 as column_values_removed from items where vals ? :'tmpcol';
select 'ALL FIX TESTS PASSED' as result;
