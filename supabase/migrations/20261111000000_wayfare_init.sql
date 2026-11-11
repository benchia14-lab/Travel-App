-- Wayfare: accounts, synced trip data and photo storage.
-- Everything is prefixed `wf_` / `wayfare-` so it can live alongside other apps in the same project.

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.wf_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  name_key text not null unique, -- e.g. "ben.chia"; matches the sign-in ID
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.wf_profiles enable row level security;

-- ── Synced records (trips, stops, plan locations, photo metadata) ───────────
create table if not exists public.wf_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('trip', 'entry', 'leg', 'media')),
  id text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);
create index if not exists wf_records_user_updated on public.wf_records (user_id, updated_at);
alter table public.wf_records enable row level security;

create or replace function public.wf_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists wf_records_touch on public.wf_records;
create trigger wf_records_touch before insert or update on public.wf_records
  for each row execute function public.wf_touch();

-- ── Admin check (private schema, not exposed over the API) ──────────────────
create schema if not exists wf_private;
grant usage on schema wf_private to authenticated;

create or replace function wf_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wf_profiles where id = auth.uid() and is_admin);
$$;
revoke all on function wf_private.is_admin() from public, anon;
grant execute on function wf_private.is_admin() to authenticated;

-- ── Row-level security ───────────────────────────────────────────────────────
-- Profiles: read your own (admins read all). Created only through wf_register().
drop policy if exists "wf profiles read" on public.wf_profiles;
create policy "wf profiles read" on public.wf_profiles for select to authenticated
  using (id = (select auth.uid()) or (select wf_private.is_admin()));

-- Records: full access to your own; admins can read everyone's.
drop policy if exists "wf records read" on public.wf_records;
create policy "wf records read" on public.wf_records for select to authenticated
  using (user_id = (select auth.uid()) or (select wf_private.is_admin()));
drop policy if exists "wf records insert" on public.wf_records;
create policy "wf records insert" on public.wf_records for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "wf records update" on public.wf_records;
create policy "wf records update" on public.wf_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "wf records delete" on public.wf_records;
create policy "wf records delete" on public.wf_records for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.wf_profiles, public.wf_records from anon;
grant select on public.wf_profiles to authenticated;
grant select, insert, update, delete on public.wf_records to authenticated;

-- ── Account functions ────────────────────────────────────────────────────────
-- Creates (or refreshes) the caller's profile. The name key comes from the sign-in ID,
-- so nobody can claim another name. The first "Ben Chia" / "Ben Chua" becomes admin.
create or replace function public.wf_register(p_first_name text, p_last_name text)
returns public.wf_profiles
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  p public.wf_profiles;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select split_part(email, '@', 1) into k from auth.users where id = auth.uid();
  if k is null or k = '' then
    raise exception 'account has no sign-in ID';
  end if;
  select * into p from public.wf_profiles where id = auth.uid();
  if found then
    update public.wf_profiles set last_seen_at = now() where id = auth.uid() returning * into p;
    return p;
  end if;
  insert into public.wf_profiles (id, first_name, last_name, name_key, is_admin)
  values (
    auth.uid(),
    left(btrim(p_first_name), 60),
    left(btrim(p_last_name), 60),
    k,
    k in ('ben.chia', 'ben.chua') and not exists (select 1 from public.wf_profiles where is_admin)
  )
  returning * into p;
  return p;
end $$;
revoke all on function public.wf_register(text, text) from public, anon;
grant execute on function public.wf_register(text, text) to authenticated;

-- Admin only: set a new PIN for a Wayfare user who forgot theirs.
create or replace function public.wf_admin_reset_pin(p_user uuid, p_password text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not wf_private.is_admin() then
    raise exception 'admins only';
  end if;
  if not exists (select 1 from public.wf_profiles where id = p_user) then
    raise exception 'unknown Wayfare user';
  end if;
  if length(p_password) < 6 then
    raise exception 'invalid PIN';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
end $$;
revoke all on function public.wf_admin_reset_pin(uuid, text) from public, anon;
grant execute on function public.wf_admin_reset_pin(uuid, text) to authenticated;

-- ── Photo & video storage ───────────────────────────────────────────────────
-- Private bucket; files live under "<user id>/…".
insert into storage.buckets (id, name, public, file_size_limit)
values ('wayfare-media', 'wayfare-media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "wayfare media read" on storage.objects;
create policy "wayfare media read" on storage.objects for select to authenticated
  using (bucket_id = 'wayfare-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select wf_private.is_admin())));
drop policy if exists "wayfare media insert" on storage.objects;
create policy "wayfare media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'wayfare-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "wayfare media update" on storage.objects;
create policy "wayfare media update" on storage.objects for update to authenticated
  using (bucket_id = 'wayfare-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'wayfare-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "wayfare media delete" on storage.objects;
create policy "wayfare media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wayfare-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
