-- Real company profile fields, captured at account creation.
alter table public.companies add column industry text;
alter table public.companies add column founded_year int;
alter table public.companies add column employee_count text;
alter table public.companies add column website text;
alter table public.companies add column corporate_office_address text;
alter table public.companies add column manufacturing_plant_address text;

-- Expand the role hierarchy: founder (super admin, the very first person at a
-- new company) -> cto (invited only by founder) -> admin/manager (invited by
-- founder or cto) -> member (invited by manager).
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('founder','cto','admin','manager','member'));

alter table public.company_invites drop constraint company_invites_role_check;
alter table public.company_invites add constraint company_invites_role_check
  check (role in ('founder','cto','admin','manager','member'));

-- "Admin-level" access (used across profiles/google_connections/twilio_numbers
-- policies) now means founder, cto, or admin — all three sit above
-- manager/member in the hierarchy.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role in ('founder','cto','admin') from public.profiles where id = auth.uid()), false);
$$;

-- Server-side enforcement of who can invite whom -- a real security rule,
-- not just a UI restriction. Matches: founder -> cto/admin/manager/member,
-- cto -> admin/manager/member, manager -> member only. Admin does not invite
-- anyone in this model (their role is access/settings management).
create or replace function public.can_invite_role(target_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'founder'
      then target_role in ('cto','admin','manager','member')
    when (select role from public.profiles where id = auth.uid()) = 'cto'
      then target_role in ('admin','manager','member')
    when (select role from public.profiles where id = auth.uid()) = 'manager'
      then target_role = 'member'
    else false
  end;
$$;

revoke execute on function public.can_invite_role(text) from anon;
revoke execute on function public.can_invite_role(text) from public;
grant execute on function public.can_invite_role(text) to authenticated;

-- Replace the old admin-only invite policies with the real hierarchy rule.
drop policy "admins can create company invites" on public.company_invites;
create policy "hierarchy-permitted users can create company invites"
  on public.company_invites for insert
  with check (company_id = public.current_company_id() and public.can_invite_role(role));

drop policy "admins can view company invites" on public.company_invites;
create policy "admin-level users can view all company invites"
  on public.company_invites for select
  using (company_id = public.current_company_id() and public.is_admin());

create policy "managers can view invites they created"
  on public.company_invites for select
  using (company_id = public.current_company_id() and invited_by = auth.uid());
