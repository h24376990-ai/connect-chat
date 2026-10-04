CREATE OR REPLACE FUNCTION public.set_call_status(_message_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.messages;
BEGIN
  IF _status NOT IN ('accepted','declined','ended','canceled') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT * INTO m FROM public.messages WHERE id = _message_id;
  IF m.id IS NULL OR m.kind <> 'system' OR m.body NOT LIKE 'call:%' THEN RAISE EXCEPTION 'not a call'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = m.conversation_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF m.body IN ('call:declined','call:ended','call:canceled') THEN RETURN; END IF;
  UPDATE public.messages SET body = 'call:' || _status, edited_at = now() WHERE id = _message_id;
END $$;
REVOKE ALL ON FUNCTION public.set_call_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_call_status(uuid, text) TO authenticated;