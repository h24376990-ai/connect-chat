CREATE TABLE IF NOT EXISTS public.community_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, name)
);

ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'approval'));
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.community_channels(id) ON DELETE CASCADE;
ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_channels TO authenticated;

CREATE OR REPLACE FUNCTION public.is_community_manager(_community_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community_id AND user_id = _user_id AND status = 'approved' AND role IN ('owner','admin'));
$$;

CREATE POLICY "Members view community channels" ON public.community_channels FOR SELECT TO authenticated USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Managers create community channels" ON public.community_channels FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.is_community_manager(community_id, auth.uid()));
CREATE POLICY "Managers update community channels" ON public.community_channels FOR UPDATE TO authenticated USING (public.is_community_manager(community_id, auth.uid())) WITH CHECK (public.is_community_manager(community_id, auth.uid()));
CREATE POLICY "Managers delete community channels" ON public.community_channels FOR DELETE TO authenticated USING (public.is_community_manager(community_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.create_community_channel(_community_id uuid, _name text, _description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE channel_id uuid;
BEGIN
  IF NOT public.is_community_manager(_community_id, auth.uid()) THEN RAISE EXCEPTION '管理者権限が必要です'; END IF;
  INSERT INTO public.community_channels(community_id, name, description, created_by) VALUES (_community_id, trim(_name), nullif(trim(_description), '')) RETURNING id INTO channel_id;
  RETURN channel_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_community_channel_conversation(_channel_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); conv uuid; cid uuid;
BEGIN
  SELECT community_id INTO cid FROM public.community_channels WHERE id = _channel_id;
  IF cid IS NULL OR NOT public.is_community_member(cid, me) THEN RAISE EXCEPTION 'チャンネルに参加できません'; END IF;
  SELECT id INTO conv FROM public.conversations WHERE kind = 'community' AND channel_id = _channel_id ORDER BY created_at LIMIT 1;
  IF conv IS NULL THEN INSERT INTO public.conversations(kind, community_id, channel_id, created_by) VALUES ('community', cid, _channel_id, me) RETURNING id INTO conv; END IF;
  INSERT INTO public.conversation_members(conversation_id, user_id) VALUES (conv, me) ON CONFLICT DO NOTHING;
  RETURN conv;
END $$;

CREATE OR REPLACE FUNCTION public.update_community_settings(_community_id uuid, _name text, _join_policy text, _image_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_community_manager(_community_id, auth.uid()) THEN RAISE EXCEPTION '管理者権限が必要です'; END IF;
  IF _join_policy NOT IN ('open','approval') THEN RAISE EXCEPTION '参加制が不正です'; END IF;
  UPDATE public.communities SET name = trim(_name), join_policy = _join_policy, image_url = COALESCE(_image_url, image_url) WHERE id = _community_id;
END $$;

REVOKE ALL ON FUNCTION public.create_community_channel(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_channel_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_community_settings(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_community_channel(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_channel_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_settings(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_community_membership(_community_id uuid)
RETURNS public.membership_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE policy text; result public.membership_status;
BEGIN
  SELECT join_policy INTO policy FROM public.communities WHERE id = _community_id AND is_dissolved = false;
  IF policy IS NULL THEN RAISE EXCEPTION 'community not found'; END IF;
  INSERT INTO public.community_members(community_id, user_id, role, status, joined_at)
  VALUES (_community_id, auth.uid(), 'member', CASE WHEN policy = 'open' THEN 'approved'::public.membership_status ELSE 'pending'::public.membership_status END, CASE WHEN policy = 'open' THEN now() ELSE NULL END)
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status, joined_at = EXCLUDED.joined_at
  RETURNING status INTO result;
  RETURN result;
END $$;
