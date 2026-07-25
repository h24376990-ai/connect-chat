
-- 1) Loosen age constraint to 1..200
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_age_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_age_check CHECK (age IS NULL OR (age >= 1 AND age <= 200));

-- 2) RPC: get_or_create direct conversation between two friends
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  conv uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF me = _other THEN RAISE EXCEPTION 'cannot chat with self'; END IF;

  -- must be friends
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND LEAST(requester_id, addressee_id) = LEAST(me, _other)
      AND GREATEST(requester_id, addressee_id) = GREATEST(me, _other)
  ) THEN
    RAISE EXCEPTION 'not friends';
  END IF;

  -- find existing direct conversation
  SELECT c.id INTO conv
  FROM public.conversations c
  JOIN public.conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = me
  JOIN public.conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = _other
  WHERE c.kind = 'direct'
  LIMIT 1;

  IF conv IS NOT NULL THEN RETURN conv; END IF;

  INSERT INTO public.conversations(kind, created_by) VALUES ('direct', me) RETURNING id INTO conv;
  INSERT INTO public.conversation_members(conversation_id, user_id) VALUES (conv, me), (conv, _other);
  RETURN conv;
END;
$$;

-- 3) Admin RLS: allow admins to read all messages / conversations / profiles
DROP POLICY IF EXISTS "Admins read all messages" ON public.messages;
CREATE POLICY "Admins read all messages" ON public.messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read all conversations" ON public.conversations;
CREATE POLICY "Admins read all conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
