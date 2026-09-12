-- Pin search_path on both SECURITY DEFINER functions (prevents search_path hijacking)
alter function public.current_company_id() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- current_company_id: only signed-in users should call it (used inside RLS policies);
-- anonymous/public should not be able to call it directly via RPC.
revoke execute on function public.current_company_id() from anon;
revoke execute on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated;

-- handle_new_user: only the auth trigger should invoke this, never directly via RPC.
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_new_user() from public;
