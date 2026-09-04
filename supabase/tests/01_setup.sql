\set ON_ERROR_STOP on
-- Depends on 00_stub.sql, the migration, and 02_fixture.sql (generated).
-- First user becomes admin via the handle_new_user trigger.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@example.com', '{"full_name":"Admin"}');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000002', 'scorer@example.com');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000003', 'viewer@example.com');

select 'TEST first-user-is-admin: ' ||
  case when (select role from profiles where email='admin@example.com') = 'admin'
       and (select role from profiles where email='scorer@example.com') = 'viewer'
  then 'PASS' else 'FAIL' end;

-- Act as the admin from here on.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select set_user_role('aaaaaaaa-0000-4000-8000-000000000002', 'scorekeeper');

select 'TEST role-change: ' ||
  case when (select role from profiles where email='scorer@example.com') = 'scorekeeper'
  then 'PASS' else 'FAIL' end;

insert into tournaments (id, name) values ('dddddddd-0000-4000-8000-00000000dddd', 'Test Cup');
insert into divisions (id, tournament_id, name, bracket_format) values
  ('11111111-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-00000000dddd','D8 Single','single'),
  ('22222222-2222-4222-8222-222222222222','dddddddd-0000-4000-8000-00000000dddd','D5 Single','single'),
  ('33333333-3333-4333-8333-333333333333','dddddddd-0000-4000-8000-00000000dddd','D6 Double','double');
