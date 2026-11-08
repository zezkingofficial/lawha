-- Access and behaviour tests. Run after auth_stub.sql and schema.sql.
\set ON_ERROR_STOP on

-- fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ahmed@tafseel.test'),
  ('00000000-0000-0000-0000-00000000000b', 'worker@tafseel.test'),
  ('00000000-0000-0000-0000-00000000000c', 'client@guest.test'),
  ('00000000-0000-0000-0000-00000000000d', 'other@othercompany.test'),
  ('00000000-0000-0000-0000-00000000000e', 'viewer@tafseel.test');
insert into profiles (id, full_name) select id, email from auth.users;
insert into accounts (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Tafseel', 'tafseel'),
  ('10000000-0000-0000-0000-000000000002', 'Other Co', 'other-co');
insert into account_members (account_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'guest'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'viewer'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'admin');
insert into workspaces (id, account_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'المصنع');

set role authenticated;

-- Ahmed (admin) creates a board with defaults
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table t as select (app.create_board('20000000-0000-0000-0000-000000000001', 'طلبات العملاء')).id as board_id;
select board_id as b from t \gset
select id as g from groups where board_id = :'b' \gset
select id as col_status from columns where board_id = :'b' and type = 'status' \gset
select id as col_people from columns where board_id = :'b' and type = 'people' \gset
select id as col_date from columns where board_id = :'b' and type = 'date' \gset

insert into items (account_id, board_id, group_id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', :'b', :'g', 'علب عطور - 500 قطعة', auth.uid())
returning id as item \gset

-- a subitem inherits board and account
insert into items (account_id, board_id, parent_item_id, name)
values ('10000000-0000-0000-0000-000000000001', :'b', :'item', 'طباعة الغطاء');

-- set cells; assign the worker
select (app.set_cell(:'item', :'col_status', '{"label_id":"working"}')).id is not null as status_set;
select (app.set_cell(:'item', :'col_people', '{"user_ids":["00000000-0000-0000-0000-00000000000b"]}')).id is not null as people_set;
select (app.set_cell(:'item', :'col_date', '{"date":"2026-11-20"}')).id is not null as date_set;

do $$ begin
  if (select count(*) from items i where (i.vals ? (select id::text from columns where type='status' limit 1))) <> 1 then
    raise exception 'FAIL: status value missing'; end if;
end $$;

-- bad values are rejected
do $$ begin
  begin
    perform app.set_cell((select id from items where parent_item_id is null limit 1),
                         (select id from columns where type='date' limit 1), '{"date":"not a date"}');
    raise exception 'FAIL: bad date accepted';
  exception when invalid_datetime_format then null; end;
end $$;

-- clearing a cell removes the key, other cells stay
select (app.set_cell(:'item', :'col_date', 'null')).id is not null;
do $$ begin
  if (select jsonb_object_keys_count from (select count(*) as jsonb_object_keys_count from items i, jsonb_object_keys(i.vals) where i.parent_item_id is null) x) <> 2 then
    raise exception 'FAIL: clearing one cell touched others'; end if;
end $$;

-- the worker was notified of the assignment and appears in item_assignees
reset role;
do $$ begin
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'assigned') <> 1 then
    raise exception 'FAIL: assignment notification'; end if;
  if (select count(*) from item_assignees where user_id = '00000000-0000-0000-0000-00000000000b') <> 1 then
    raise exception 'FAIL: item_assignees sync'; end if;
  if (select count(*) from activity_log where action = 'cell_changed') < 3 then
    raise exception 'FAIL: activity log'; end if;
end $$;
set role authenticated;

-- Worker (member) reads the board, edits, and posts an update mentioning Ahmed
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from items) <> 2 then raise exception 'FAIL: member cannot see items'; end if;
end $$;
select (app.set_cell(:'item', :'col_status', '{"label_id":"done"}')).id is not null as member_edit;
insert into updates (account_id, board_id, item_id, author_id, body, body_text, mentioned_user_ids)
values ('10000000-0000-0000-0000-000000000001', :'b', :'item', auth.uid(), '{"type":"doc"}', 'جاهز للتسليم',
        array['00000000-0000-0000-0000-00000000000a']::uuid[]);

do $$ begin
  if (select vals->(select id::text from columns where type='status')->>'label_id' from items where parent_item_id is null) <> 'done' then
    raise exception 'FAIL: member edit not saved'; end if;
end $$;

-- Ahmed gets exactly one notification for it (mention, not also "update")
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from notifications where update_id is not null) <> 1 then
    raise exception 'FAIL: expected one notification for Ahmed, got %', (select count(*) from notifications where update_id is not null); end if;
  if (select kind from notifications where update_id is not null) <> 'mention' then
    raise exception 'FAIL: notification kind'; end if;
end $$;

-- Viewer can read but not edit
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  if (select count(*) from items) <> 2 then raise exception 'FAIL: viewer cannot read'; end if;
  begin
    perform app.set_cell((select id from items where parent_item_id is null), (select id from columns where type='status'), '{"label_id":"stuck"}');
    raise exception 'FAIL: viewer edited a cell';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Guest sees nothing until invited to the board
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if (select count(*) from boards) <> 0 or (select count(*) from items) <> 0 then
    raise exception 'FAIL: guest sees boards without invite'; end if;
  if (select count(*) from workspaces) <> 0 then raise exception 'FAIL: guest sees workspaces'; end if;
end $$;

-- Other company sees nothing at all
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  if (select count(*) from boards) + (select count(*) from items) + (select count(*) from updates)
     + (select count(*) from profiles where id <> auth.uid()) <> 0 then
    raise exception 'FAIL: cross-tenant leak'; end if;
  begin
    insert into items (account_id, board_id, group_id, name)
    values ('10000000-0000-0000-0000-000000000001', (select board_id from t), (select id from groups limit 1), 'hack');
    raise exception 'FAIL: cross-tenant insert';
  exception when insufficient_privilege or not_null_violation or check_violation then null;
  end;
end $$;

-- Ahmed shares the board with the guest; guest now sees only that board
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update boards set kind = 'shareable' where id = :'b';
insert into board_members (board_id, user_id, role) values (:'b', '00000000-0000-0000-0000-00000000000c', 'viewer');
select (app.create_board('20000000-0000-0000-0000-000000000001', 'لوحة داخلية')).id is not null as second_board;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if (select count(*) from boards) <> 1 then raise exception 'FAIL: guest board scope (%)', (select count(*) from boards); end if;
end $$;

-- Private board is hidden from members who are not on it
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update boards set kind = 'private' where name = 'لوحة داخلية';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if exists (select 1 from boards where name = 'لوحة داخلية') then raise exception 'FAIL: private board visible'; end if;
end $$;

-- Arabic search on name
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from items where search_text like '%' || lower('عطور') || '%') <> 1 then
    raise exception 'FAIL: arabic search'; end if;
end $$;

reset role;
select 'ALL TESTS PASSED' as result;
