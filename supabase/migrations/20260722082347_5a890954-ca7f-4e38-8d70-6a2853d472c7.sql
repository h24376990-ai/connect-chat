
ALTER TABLE public.friend_recruitments DROP CONSTRAINT IF EXISTS friend_recruitments_body_check;
ALTER TABLE public.friend_recruitments ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.friend_recruitments ADD CONSTRAINT friend_recruitments_body_check CHECK (body IS NULL OR char_length(body) <= 1000);

CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_name text;
  their_name text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF me = _addressee THEN RAISE EXCEPTION '自分には申請できません'; END IF;

  SELECT display_name INTO my_name FROM public.profiles WHERE id = me;
  SELECT display_name INTO their_name FROM public.profiles WHERE id = _addressee;
  IF their_name IS NULL THEN RAISE EXCEPTION 'ユーザーが見つかりません'; END IF;

  INSERT INTO public.friendships(requester_id, addressee_id, status)
  VALUES (me, _addressee, 'pending')
  ON CONFLICT ON CONSTRAINT friendships_unique_pair DO NOTHING;

  INSERT INTO public.notifications(user_id, actor_id, kind, title, body, resource_type)
  VALUES (_addressee, me, 'friend_request', 'フレンド申請が届きました', my_name || 'さんからフレンド申請が届きました', 'friendship');

  INSERT INTO public.notifications(user_id, actor_id, kind, title, body, resource_type)
  VALUES (me, me, 'friend_request', 'フレンド申請を送信しました', their_name || 'さんにフレンド申請しました', 'friendship');
END;
$$;

-- Allow the self-notification insert above (bypasses actor<>user policy via SECURITY DEFINER already, but we need to ensure notifications insert works; SECURITY DEFINER bypasses RLS)
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;
