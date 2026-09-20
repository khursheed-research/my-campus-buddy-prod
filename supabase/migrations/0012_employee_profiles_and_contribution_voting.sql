-- Extended employee profile: kept separate from `profiles` because it needs
-- much tighter visibility (self + manager + admin-level only).
create table public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  department text,
  manager_id uuid references public.profiles(id) on delete set null,
  day_to_day_activity text,
  previous_company text,
  years_experience numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;

create policy "self, manager, or admin-level can view employee profile"
  on public.employee_profiles for select
  using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or manager_id = auth.uid() or public.is_admin())
  );

create policy "self or admin-level can create employee profile"
  on public.employee_profiles for insert
  with check (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.is_admin())
  );

create policy "self or admin-level can update employee profile"
  on public.employee_profiles for update
  using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.is_admin())
  );

-- Peer voting on captured insights (notes/decisions). One vote per person
-- per interaction; no self-voting (enforced in cast_vote, not just the UI).
create table public.contribution_votes (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  voted_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (interaction_id, voted_by)
);

alter table public.contribution_votes enable row level security;

create policy "members can view company votes"
  on public.contribution_votes for select
  using (company_id = public.current_company_id());

create or replace function public.cast_vote(target_interaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  cid uuid;
begin
  select created_by, company_id into author, cid
  from public.interactions
  where id = target_interaction_id;

  if cid is null or cid != public.current_company_id() then
    raise exception 'Interaction not found';
  end if;

  if author = auth.uid() then
    raise exception 'You cannot vote for your own insight';
  end if;

  insert into public.contribution_votes (interaction_id, company_id, voted_by)
  values (target_interaction_id, cid, auth.uid())
  on conflict (interaction_id, voted_by) do nothing;
end;
$$;

revoke execute on function public.cast_vote(uuid) from anon;
revoke execute on function public.cast_vote(uuid) from public;
grant execute on function public.cast_vote(uuid) to authenticated;

-- Department-scoped semantic search, alongside the existing unscoped
-- versions (kept for backward compatibility).
create or replace function public.match_document_chunks_filtered(
  query_embedding vector(768),
  match_count int default 8,
  filter_department text default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql
security definer
set search_path = public
stable
as $$
  select dc.id, dc.document_id, dc.content, 1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.company_id = public.current_company_id()
    and (filter_department is null or dc.department = filter_department)
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_interactions_filtered(
  query_embedding vector(768),
  match_count int default 8,
  filter_department text default null
)
returns table (id uuid, lead_id uuid, summary text, raw_content text, occurred_at timestamptz, similarity float)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.lead_id, i.summary, i.raw_content, i.occurred_at, 1 - (i.embedding <=> query_embedding) as similarity
  from public.interactions i
  where i.company_id = public.current_company_id()
    and i.embedding is not null
    and (filter_department is null or i.department = filter_department)
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_document_chunks_filtered(vector, int, text) from anon;
revoke execute on function public.match_document_chunks_filtered(vector, int, text) from public;
grant execute on function public.match_document_chunks_filtered(vector, int, text) to authenticated;

revoke execute on function public.match_interactions_filtered(vector, int, text) from anon;
revoke execute on function public.match_interactions_filtered(vector, int, text) from public;
grant execute on function public.match_interactions_filtered(vector, int, text) to authenticated;
