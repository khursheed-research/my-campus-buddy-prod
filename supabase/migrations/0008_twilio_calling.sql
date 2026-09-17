create table public.twilio_numbers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone_number text not null unique,
  department text not null default 'sales',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.twilio_numbers enable row level security;

create policy "members can view own company twilio number"
  on public.twilio_numbers for select
  using (company_id = public.current_company_id());

create policy "admins can manage own company twilio number"
  on public.twilio_numbers for all
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

alter table public.interactions add column external_call_sid text unique;
alter table public.interactions add column recording_url text;
