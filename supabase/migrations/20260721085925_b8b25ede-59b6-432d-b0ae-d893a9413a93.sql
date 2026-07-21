CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE public.community_member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.membership_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.conversation_kind AS ENUM ('direct', 'community');
CREATE TYPE public.message_kind AS ENUM ('text', 'image', 'video', 'system');
CREATE TYPE public.notification_kind AS ENUM ('message', 'friend_request', 'friend_accepted', 'like', 'comment', 'community');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 50),
  avatar_url text,
  age smallint CHECK (age BETWEEN 18 AND 120),
  gender text CHECK (gender IS NULL OR char_length(gender) <= 30),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 160),
  hobby_tags text[] NOT NULL DEFAULT '{}',
  background_url text,
  theme_color text NOT NULL DEFAULT '#25B7A5' CHECK (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX profiles_search_idx ON public.profiles (age, gender, is_online);
CREATE INDEX profiles_hobbies_idx ON public.profiles USING gin (hobby_tags);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  home_layout jsonb NOT NULL DEFAULT '[{"id":"profile","visible":true,"size":"medium"},{"id":"friend-recruitments","visible":true,"size":"large"},{"id":"communities","visible":true,"size":"medium"},{"id":"friend-chat","visible":true,"size":"medium"},{"id":"community-chat","visible":true,"size":"medium"},{"id":"timeline","visible":true,"size":"large"}]'::jsonb,
  theme_color text NOT NULL DEFAULT '#25B7A5' CHECK (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text NOT NULL DEFAULT '#F5FAF9' CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  home_template text NOT NULL DEFAULT 'recommended' CHECK (char_length(home_template) <= 30),
  sound_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  requester_favorite boolean NOT NULL DEFAULT false,
  addressee_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_unique_pair ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view friendships" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "Users send friend requests" ON public.friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id AND status = 'pending');
CREATE POLICY "Participants update friendships" ON public.friendships FOR UPDATE TO authenticated USING (auth.uid() IN (requester_id, addressee_id)) WITH CHECK (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "Participants delete friendships" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX friendships_requester_idx ON public.friendships (requester_id, status);
CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id, status);

CREATE TABLE public.friend_recruitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  min_age smallint CHECK (min_age IS NULL OR min_age BETWEEN 18 AND 120),
  max_age smallint CHECK (max_age IS NULL OR max_age BETWEEN 18 AND 120),
  gender_condition text CHECK (gender_condition IS NULL OR char_length(gender_condition) <= 30),
  hobby_tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_recruitments TO authenticated;
GRANT ALL ON public.friend_recruitments TO service_role;
ALTER TABLE public.friend_recruitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view active recruitments and own" ON public.friend_recruitments FOR SELECT TO authenticated USING (is_active OR auth.uid() = author_id);
CREATE POLICY "Users create recruitments" ON public.friend_recruitments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update recruitments" ON public.friend_recruitments FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete recruitments" ON public.friend_recruitments FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE TRIGGER friend_recruitments_updated_at BEFORE UPDATE ON public.friend_recruitments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX friend_recruitments_feed_idx ON public.friend_recruitments (is_active, created_at DESC);
CREATE INDEX friend_recruitments_hobbies_idx ON public.friend_recruitments USING gin (hobby_tags);

CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  image_url text,
  is_dissolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users view communities" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners update communities" ON public.communities FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete communities" ON public.communities FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.community_member_role NOT NULL DEFAULT 'member',
  status public.membership_status NOT NULL DEFAULT 'pending',
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view community memberships" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users request community membership" ON public.community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND role = 'member' AND status = 'pending');
CREATE POLICY "Members leave communities" ON public.community_members FOR DELETE TO authenticated USING (auth.uid() = user_id AND role <> 'owner');
CREATE TRIGGER community_members_updated_at BEFORE UPDATE ON public.community_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX community_members_user_idx ON public.community_members (user_id, status);
CREATE INDEX community_members_community_idx ON public.community_members (community_id, status);

CREATE OR REPLACE FUNCTION public.create_community(_name text, _description text DEFAULT NULL, _image_url text DEFAULT NULL)
RETURNS public.communities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.communities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF char_length(trim(_name)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'invalid community name'; END IF;
  INSERT INTO public.communities(owner_id, name, description, image_url)
  VALUES (auth.uid(), trim(_name), nullif(trim(_description), ''), _image_url) RETURNING * INTO created;
  INSERT INTO public.community_members(community_id, user_id, role, status, joined_at)
  VALUES (created.id, auth.uid(), 'owner', 'approved', now());
  RETURN created;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_community(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_community_member(_community_id uuid, _user_id uuid, _approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community_id AND user_id = auth.uid() AND role IN ('owner','admin') AND status = 'approved') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.community_members SET status = CASE WHEN _approved THEN 'approved'::public.membership_status ELSE 'rejected'::public.membership_status END, joined_at = CASE WHEN _approved THEN now() ELSE NULL END WHERE community_id = _community_id AND user_id = _user_id AND role = 'member';
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_community_member(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_community_owner(_community_id uuid, _new_owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = _community_id AND owner_id = auth.uid() AND NOT is_dissolved) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community_id AND user_id = _new_owner_id AND status = 'approved') THEN RAISE EXCEPTION 'new owner must be an approved member'; END IF;
  UPDATE public.community_members SET role = 'admin' WHERE community_id = _community_id AND user_id = auth.uid();
  UPDATE public.community_members SET role = 'owner' WHERE community_id = _community_id AND user_id = _new_owner_id;
  UPDATE public.communities SET owner_id = _new_owner_id WHERE id = _community_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.transfer_community_owner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_community_member(_community_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = _community_id AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'owner cannot remove self'; END IF;
  DELETE FROM public.community_members WHERE community_id = _community_id AND user_id = _user_id AND role <> 'owner';
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_community_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dissolve_community(_community_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.communities SET is_dissolved = true WHERE id = _community_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dissolve_community(uuid) TO authenticated;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.conversation_kind NOT NULL,
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'community' AND community_id IS NOT NULL) OR (kind = 'direct' AND community_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view conversation memberships" ON public.conversation_members FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversation_members mine WHERE mine.conversation_id = conversation_members.conversation_id AND mine.user_id = auth.uid()));
CREATE POLICY "Users update own read state" ON public.conversation_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Conversation creators add members" ON public.conversation_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()));
CREATE POLICY "Users leave conversations" ON public.conversation_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members view conversations" ON public.conversations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid()));
CREATE POLICY "Users create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators update conversations" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  kind public.message_kind NOT NULL DEFAULT 'text',
  body text CHECK (body IS NULL OR char_length(body) <= 4000),
  media_url text,
  media_thumbnail_url text,
  media_duration_seconds integer CHECK (media_duration_seconds IS NULL OR media_duration_seconds BETWEEN 0 AND 3600),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CHECK (body IS NOT NULL OR media_url IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Members send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Senders update messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Senders delete messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);
CREATE INDEX messages_page_idx ON public.messages (conversation_id, created_at DESC);

CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Message members view reactions" ON public.message_reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_id AND cm.user_id = auth.uid()));
CREATE POLICY "Message members react" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.messages m JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_id AND cm.user_id = auth.uid()));
CREATE POLICY "Users remove own reactions" ON public.message_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  body text CHECK (body IS NULL OR char_length(body) <= 2000),
  image_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR cardinality(image_urls) > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view posts" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update posts" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete posts" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX posts_feed_idx ON public.posts (created_at DESC);

CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view likes" ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users like posts" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own likes" ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view comments" ON public.post_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create comments" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update comments" ON public.post_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors and admins delete comments" ON public.post_comments FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER post_comments_updated_at BEFORE UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX post_comments_page_idx ON public.post_comments (post_id, created_at ASC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  kind public.notification_kind NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body text CHECK (body IS NULL OR char_length(body) <= 300),
  resource_type text CHECK (resource_type IS NULL OR char_length(resource_type) <= 40),
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated actors create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id AND user_id <> auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, read_at, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_members;