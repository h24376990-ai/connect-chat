CREATE OR REPLACE FUNCTION public.get_community_conversation(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); conv uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.is_community_member(_community_id, me) THEN RAISE EXCEPTION 'コミュニティのメンバーではありません'; END IF;
  SELECT id INTO conv FROM public.conversations WHERE kind = 'community' AND community_id = _community_id ORDER BY created_at LIMIT 1;
  IF conv IS NULL THEN
    INSERT INTO public.conversations(kind, community_id, created_by) VALUES ('community', _community_id, me) RETURNING id INTO conv;
  END IF;
  INSERT INTO public.conversation_members(conversation_id, user_id) SELECT conv, me
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = conv AND user_id = me);
  RETURN conv;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_community_conversation(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_community_conversation(uuid) TO authenticated;