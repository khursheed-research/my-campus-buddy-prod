alter table public.interactions add column is_decision boolean not null default false;
alter table public.interactions add column topics text[] not null default '{}';

create index interactions_is_decision_idx on public.interactions (company_id, is_decision) where is_decision = true;
create index interactions_topics_idx on public.interactions using gin (topics);
