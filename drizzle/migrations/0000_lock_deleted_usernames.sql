CREATE OR REPLACE FUNCTION public.username_blocked_until(_username text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT blocked_until FROM public.deleted_usernames
  WHERE username = lower(_username) AND blocked_until > now() LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.username_blocked_until(text) TO anon, authenticated;
DROP POLICY IF EXISTS "deleted usernames are readable" ON public.deleted_usernames;
REVOKE SELECT ON public.deleted_usernames FROM anon, authenticated;