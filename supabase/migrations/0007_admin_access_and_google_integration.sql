create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "admins can update company profiles"
  on public.profiles for update
  using (company_id = public.current_company_id() and public.is_admin());

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','manager','member')),
  clearance text not null default 'ic' check (clearance in ('executive','leadership','manager','ic')),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.company_invites enable row level security;

create policy "admins can view company invites"
  on public.company_invites for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "admins can create company invites"
  on public.company_invites for insert
  with check (company_id = public.current_company_id() and public.is_admin());

create policy "users can view their own pending invite"
  on public.company_invites for select
  using (accepted_at is null and lower(email) = lower(auth.jwt() ->> 'email'));

create policy "users can accept their own invite"
  on public.company_invites for update
  using (accepted_at is null and lower(email) = lower(auth.jwt() ->> 'email'));

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  google_email text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

create policy "members can view own company google connection"
  on public.google_connections for select
  using (company_id = public.current_company_id());

create policy "admins can manage own company google connection"
  on public.google_connections for all
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());
