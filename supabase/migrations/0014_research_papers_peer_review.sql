create table public.research_papers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  abstract text not null,
  introduction text,
  methodology text,
  findings text,
  conclusion text,
  references_text text,
  department text not null default 'general',
  status text not null default 'draft' check (status in ('draft','submitted','published','rejected')),
  embedding vector(768),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz
);

alter table public.research_papers enable row level security;

create policy "authors can view their own papers at any status"
  on public.research_papers for select
  using (company_id = public.current_company_id() and author_id = auth.uid());

create policy "company can view submitted or published papers"
  on public.research_papers for select
  using (company_id = public.current_company_id() and status in ('submitted','published'));

create policy "authors can create their own draft papers"
  on public.research_papers for insert
  with check (company_id = public.current_company_id() and author_id = auth.uid() and status = 'draft');

create policy "authors can edit their own draft papers"
  on public.research_papers for update
  using (company_id = public.current_company_id() and author_id = auth.uid() and status = 'draft');

create or replace function public.submit_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_papers
  set status = 'submitted', submitted_at = now()
  where id = paper_id
    and company_id = public.current_company_id()
    and author_id = auth.uid()
    and status = 'draft';
end;
$$;

create or replace function public.publish_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin-level users can publish a paper';
  end if;

  update public.research_papers
  set status = 'published', published_at = now()
  where id = paper_id
    and company_id = public.current_company_id()
    and status = 'submitted';
end;
$$;

create or replace function public.reject_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin-level users can reject a paper';
  end if;

  update public.research_papers
  set status = 'rejected'
  where id = paper_id
    and company_id = public.current_company_id()
    and status = 'submitted';
end;
$$;

revoke execute on function public.submit_paper(uuid) from anon;
revoke execute on function public.submit_paper(uuid) from public;
grant execute on function public.submit_paper(uuid) to authenticated;

revoke execute on function public.publish_paper(uuid) from anon;
revoke execute on function public.publish_paper(uuid) from public;
grant execute on function public.publish_paper(uuid) to authenticated;

revoke execute on function public.reject_paper(uuid) from anon;
revoke execute on function public.reject_paper(uuid) from public;
grant execute on function public.reject_paper(uuid) to authenticated;

create table public.paper_reviews (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.research_papers(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);

alter table public.paper_reviews enable row level security;

create policy "company can view reviews on visible papers"
  on public.paper_reviews for select
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.research_papers p
      where p.id = paper_reviews.paper_id
        and (p.status in ('submitted','published') or p.author_id = auth.uid())
    )
  );

create policy "company can review submitted or published papers"
  on public.paper_reviews for insert
  with check (
    company_id = public.current_company_id()
    and reviewer_id = auth.uid()
    and exists (
      select 1 from public.research_papers p
      where p.id = paper_reviews.paper_id and p.status in ('submitted','published')
    )
  );

create index research_papers_status_idx on public.research_papers (company_id, status);
create index research_papers_embedding_idx on public.research_papers using hnsw (embedding vector_cosine_ops);
create index paper_reviews_paper_idx on public.paper_reviews (paper_id);

create or replace function public.match_papers(
  query_embedding vector(768),
  match_count int default 5
)
returns table (id uuid, title text, abstract text, similarity float)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.title, p.abstract, 1 - (p.embedding <=> query_embedding) as similarity
  from public.research_papers p
  where p.company_id = public.current_company_id()
    and p.status = 'published'
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_papers(vector, int) from anon;
revoke execute on function public.match_papers(vector, int) from public;
grant execute on function public.match_papers(vector, int) to authenticated;
