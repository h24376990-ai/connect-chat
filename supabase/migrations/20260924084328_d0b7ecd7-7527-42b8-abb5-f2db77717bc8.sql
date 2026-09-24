CREATE OR REPLACE FUNCTION public.is_community_member(_cid uuid, _uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id=_cid AND user_id=_uid AND status='approved');
$$;
CREATE OR REPLACE FUNCTION public.is_community_manager(_cid uuid, _uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id=_cid AND user_id=_uid AND status='approved' AND role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "Users view community memberships" ON public.community_members;
DROP POLICY IF EXISTS "Community managers update memberships" ON public.community_members;
CREATE POLICY "View own or same-community memberships" ON public.community_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_community_member(community_id, auth.uid()) OR public.is_community_manager(community_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Managers update memberships" ON public.community_members FOR UPDATE TO authenticated
  USING (public.is_community_manager(community_id, auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_community_manager(community_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage memberships" ON public.community_members FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.community_members FROM anon;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users delete own profile" ON public.profiles;
CREATE POLICY "Users delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.profiles FROM anon;

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins create announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND author_id = auth.uid());
CREATE POLICY "Admins delete announcements" ON public.announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;