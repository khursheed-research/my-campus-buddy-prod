-- Extensions
create extension if not exists vector;

-- Companies (tenants)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles: one row per auth user, scoped to a company
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  role text not null default 'member' check (role in ('admin','manager','member')),
  clearance text not null default 'ic' check (clearance in ('executive','leadership','manager','ic')),
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create policy "members can view own company"
  on public.companies for select
  using (id = public.current_company_id());

create policy "users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

create policy "members can view company profiles"
  on public.profiles for select
  using (company_id = public.current_company_id());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
