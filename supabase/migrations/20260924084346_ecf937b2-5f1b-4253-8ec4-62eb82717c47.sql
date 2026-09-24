REVOKE EXECUTE ON FUNCTION public.is_community_member(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_community_manager(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_manager(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;