alter table public.document_chunks
  add constraint document_chunks_unique_chunk unique (document_id, chunk_index);
