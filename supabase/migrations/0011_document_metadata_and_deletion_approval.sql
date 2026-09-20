-- Real metadata captured at upload time.
alter table public.documents add column description text;
alter table public.documents add column department text not null default 'general';
alter table public.documents add column document_year int;
alter table public.documents add column author text;

-- Two-step deletion: request, then a separate admin-level approval.
alter table public.documents add column deletion_status text not null default 'none'
  check (deletion_status in ('none','pending','rejected'));
alter table public.documents add column deletion_requested_by uuid references public.profiles(id) on delete set null;
alter table public.documents add column deletion_requested_at timestamptz;

alter table public.document_chunks add column department text not null default 'general';

create index documents_department_idx on public.documents (company_id, department);
create index document_chunks_department_idx on public.document_chunks (company_id, department);

-- Narrow, purpose-built functions instead of a broad UPDATE policy — avoids
-- any way to tamper with unrelated document fields via a raw UPDATE.
create or replace function public.request_document_deletion(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.documents
  set deletion_status = 'pending',
      deletion_requested_by = auth.uid(),
      deletion_requested_at = now()
  where id = doc_id
    and company_id = public.current_company_id()
    and deletion_status = 'none';
end;
$$;

create or replace function public.approve_document_deletion(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin-level users can approve document deletion';
  end if;

  delete from public.documents
  where id = doc_id
    and company_id = public.current_company_id()
    and deletion_status = 'pending';
end;
$$;

create or replace function public.reject_document_deletion(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin-level users can reject a deletion request';
  end if;

  update public.documents
  set deletion_status = 'none', deletion_requested_by = null, deletion_requested_at = null
  where id = doc_id
    and company_id = public.current_company_id()
    and deletion_status = 'pending';
end;
$$;

revoke execute on function public.request_document_deletion(uuid) from anon;
revoke execute on function public.request_document_deletion(uuid) from public;
grant execute on function public.request_document_deletion(uuid) to authenticated;

revoke execute on function public.approve_document_deletion(uuid) from anon;
revoke execute on function public.approve_document_deletion(uuid) from public;
grant execute on function public.approve_document_deletion(uuid) to authenticated;

revoke execute on function public.reject_document_deletion(uuid) from anon;
revoke execute on function public.reject_document_deletion(uuid) from public;
grant execute on function public.reject_document_deletion(uuid) to authenticated;
