-- Revoke EXECUTE on internal SECURITY DEFINER functions from public/anon/authenticated.
-- These are used only as triggers (handle_new_user) or trigger helpers (update_updated_at_column)
-- and must NOT be invokable by API callers.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;