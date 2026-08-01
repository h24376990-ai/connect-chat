CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Members view conversation memberships" ON public.conversation_members;
CREATE POLICY "Members view conversation memberships"
ON public.conversation_members FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members view conversations" ON public.conversations;
CREATE POLICY "Members view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members view messages" ON public.messages;
CREATE POLICY "Members view messages"
ON public.messages FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members send messages" ON public.messages;
CREATE POLICY "Members send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND public.is_conversation_member(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.request_community_membership(_community_id uuid)
RETURNS public.membership_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status public.membership_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = _community_id AND is_dissolved = false) THEN
    RAISE EXCEPTION 'community not found';
  END IF;

  INSERT INTO public.community_members(community_id, user_id, role, status, joined_at)
  VALUES (_community_id, auth.uid(), 'member', 'pending', NULL)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = CASE
      WHEN community_members.status = 'rejected' THEN 'pending'::public.membership_status
      ELSE community_members.status
    END,
    updated_at = now()
  RETURNING status INTO current_status;

  RETURN current_status;
END;
$$;

REVOKE ALL ON FUNCTION public.request_community_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_community_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_community_membership(uuid) TO service_role;