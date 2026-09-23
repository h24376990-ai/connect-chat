CREATE TABLE public.deleted_usernames (
  username text PRIMARY KEY,
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deleted_usernames TO anon;
GRANT SELECT ON public.deleted_usernames TO authenticated;
GRANT ALL ON public.deleted_usernames TO service_role;
ALTER TABLE public.deleted_usernames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deleted usernames are readable" ON public.deleted_usernames FOR SELECT USING (true);