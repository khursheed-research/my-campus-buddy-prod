alter table public.employee_profiles add column employee_id text;
alter table public.employee_profiles add column date_of_joining date;
alter table public.employee_profiles add column employment_type text
  check (employment_type in ('full-time','part-time','contract','intern') or employment_type is null);
alter table public.employee_profiles add column job_title text;
alter table public.employee_profiles add column work_location text;
alter table public.employee_profiles add column skills text[] not null default '{}';
alter table public.employee_profiles add column education text;
alter table public.employee_profiles add column certifications text[] not null default '{}';
