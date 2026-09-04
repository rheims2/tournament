-- Minimal stand-in for the parts of Supabase the migration depends on, so the
-- schema can be exercised against a plain Postgres instance.
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

-- Real Supabase reads the signed JWT; the tests set the claim directly.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
