-- Restrict the SECURITY DEFINER function to its existing auth.users trigger.
-- The trigger remains installed; this only removes callable Data API privileges.
revoke execute on function public.create_app_user_profile() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
