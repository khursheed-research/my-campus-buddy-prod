create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department text not null default 'sales',
  name text not null,
  organization text,
  contact_email text,
  contact_phone text,
  source text,
  status text not null default 'raw'
    check (status in ('raw','called','meeting_done','proposal_sent','closed_won','closed_lost')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department text not null default 'sales',
  lead_id uuid references public.leads(id) on delete set null,
  type text not null check (type in ('call','meeting','note','email')),
  source text not null default 'manual' check (source in ('manual','voice','call_recording','email_sync')),
  raw_content text,
  summary text,
  sentiment text check (sentiment in ('positive','neutral','negative') or sentiment is null),
  next_step text,
  extracted_json jsonb,
  status text not null default 'raw' check (status in ('raw','processing','processed','error')),
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  situation text not null,
  recommendation text,
  status text not null default 'pending' check (status in ('pending','generated','error')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  outcome_type text not null,
  value numeric,
  description text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.tag_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead','interaction','outcome')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, entity_type, entity_id)
);

alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.strategies enable row level security;
alter table public.outcomes enable row level security;
alter table public.tags enable row level security;
alter table public.tag_assignments enable row level security;

create policy "members can view company leads" on public.leads for select using (company_id = public.current_company_id());
create policy "members can insert company leads" on public.leads for insert with check (company_id = public.current_company_id());
create policy "members can update company leads" on public.leads for update using (company_id = public.current_company_id());
create policy "members can delete company leads" on public.leads for delete using (company_id = public.current_company_id());

create policy "members can view company interactions" on public.interactions for select using (company_id = public.current_company_id());
create policy "members can insert company interactions" on public.interactions for insert with check (company_id = public.current_company_id() and created_by = auth.uid());
create policy "members can update company interactions" on public.interactions for update using (company_id = public.current_company_id());
create policy "members can delete company interactions" on public.interactions for delete using (company_id = public.current_company_id());

create policy "members can view company strategies" on public.strategies for select using (company_id = public.current_company_id());
create policy "members can insert company strategies" on public.strategies for insert with check (company_id = public.current_company_id() and created_by = auth.uid());
create policy "members can update company strategies" on public.strategies for update using (company_id = public.current_company_id());

create policy "members can view company outcomes" on public.outcomes for select using (company_id = public.current_company_id());
create policy "members can insert company outcomes" on public.outcomes for insert with check (company_id = public.current_company_id() and created_by = auth.uid());
create policy "members can update company outcomes" on public.outcomes for update using (company_id = public.current_company_id());

create policy "members can view company tags" on public.tags for select using (company_id = public.current_company_id());
create policy "members can insert company tags" on public.tags for insert with check (company_id = public.current_company_id());

create policy "members can view company tag assignments" on public.tag_assignments for select using (company_id = public.current_company_id());
create policy "members can insert company tag assignments" on public.tag_assignments for insert with check (company_id = public.current_company_id());
create policy "members can delete company tag assignments" on public.tag_assignments for delete using (company_id = public.current_company_id());

create index leads_company_status_idx on public.leads (company_id, status);
create index interactions_company_occurred_idx on public.interactions (company_id, occurred_at desc);
create index interactions_lead_idx on public.interactions (lead_id);
create index outcomes_company_idx on public.outcomes (company_id, occurred_at desc);
create index tag_assignments_entity_idx on public.tag_assignments (entity_type, entity_id);
