create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

alter table public.document_chunks enable row level security;

create policy "members can view company document chunks"
  on public.document_chunks for select
  using (company_id = public.current_company_id());

create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create index document_chunks_document_id_idx on public.document_chunks (document_id);

create or replace function public.match_document_chunks(
  query_embedding vector(768),
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql
security definer
set search_path = public
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.company_id = public.current_company_id()
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_document_chunks from anon;
revoke execute on function public.match_document_chunks from public;
grant execute on function public.match_document_chunks to authenticated;
