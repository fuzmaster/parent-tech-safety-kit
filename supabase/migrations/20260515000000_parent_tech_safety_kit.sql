create extension if not exists pgcrypto;

create table public.parent_profiles (
  id uuid primary key default gen_random_uuid(),
  helper_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  slug text not null unique,
  emergency_note text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.helper_contacts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parent_profiles(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create type public.help_request_kind as enum ('broken', 'scam', 'login');

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parent_profiles(id) on delete cascade,
  kind public.help_request_kind not null,
  message text,
  diagnostic_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.parent_heartbeats (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parent_profiles(id) on delete cascade,
  diagnostic_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.binder_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parent_profiles(id) on delete cascade,
  section text not null,
  label text not null,
  public_value text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.encrypted_binder_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parent_profiles(id) on delete cascade,
  label text not null,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  algorithm text not null,
  kdf text not null,
  iterations integer not null,
  created_at timestamptz not null default now()
);

alter table public.parent_profiles enable row level security;
alter table public.helper_contacts enable row level security;
alter table public.help_requests enable row level security;
alter table public.parent_heartbeats enable row level security;
alter table public.binder_items enable row level security;
alter table public.encrypted_binder_items enable row level security;

create policy "helpers manage own parents" on public.parent_profiles
  for all to authenticated
  using (helper_user_id = auth.uid())
  with check (helper_user_id = auth.uid());

create policy "helpers manage contacts for own parents" on public.helper_contacts
  for all to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()))
  with check (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create policy "helpers view and update help requests for own parents" on public.help_requests
  for select to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create policy "helpers update help requests for own parents" on public.help_requests
  for update to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()))
  with check (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create policy "helpers view heartbeats for own parents" on public.parent_heartbeats
  for select to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create policy "helpers manage binder items for own parents" on public.binder_items
  for all to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()))
  with check (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create policy "helpers manage encrypted binder items for own parents" on public.encrypted_binder_items
  for all to authenticated
  using (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()))
  with check (exists (select 1 from public.parent_profiles p where p.id = parent_id and p.helper_user_id = auth.uid()));

create or replace function public.notify_help_request_email()
returns trigger
language plpgsql
security definer
as $$
begin
  -- MVP hook: configure a database webhook or provider integration to send email for this event.
  perform pg_notify('help_request_created', json_build_object('help_request_id', new.id, 'parent_id', new.parent_id, 'kind', new.kind)::text);
  return new;
end;
$$;

create trigger help_request_email_notification
after insert on public.help_requests
for each row execute function public.notify_help_request_email();

create index parent_profiles_helper_user_id_idx on public.parent_profiles(helper_user_id);
create index parent_profiles_slug_idx on public.parent_profiles(slug);
create index helper_contacts_parent_id_idx on public.helper_contacts(parent_id);
create index help_requests_parent_id_created_at_idx on public.help_requests(parent_id, created_at desc);
create index parent_heartbeats_parent_id_created_at_idx on public.parent_heartbeats(parent_id, created_at desc);
create index binder_items_parent_id_idx on public.binder_items(parent_id);
create index encrypted_binder_items_parent_id_idx on public.encrypted_binder_items(parent_id);
