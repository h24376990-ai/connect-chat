
CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  my_name text;
  their_name text;
  inserted_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF me = _addressee THEN RAISE EXCEPTION '自分には申請できません'; END IF;

  SELECT display_name INTO my_name FROM public.profiles WHERE id = me;
  SELECT display_name INTO their_name FROM public.profiles WHERE id = _addressee;
  IF their_name IS NULL THEN RAISE EXCEPTION 'ユーザーが見つかりません'; END IF;

  INSERT INTO public.friendships(requester_id, addressee_id, status)
  SELECT me, _addressee, 'pending'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE LEAST(requester_id, addressee_id) = LEAST(me, _addressee)
      AND GREATEST(requester_id, addressee_id) = GREATEST(me, _addressee)
  )
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications(user_id, actor_id, kind, title, body, resource_type)
  VALUES (_addressee, me, 'friend_request', 'フレンド申請が届きました', my_name || 'さんからフレンド申請が届きました', 'friendship');

  INSERT INTO public.notifications(user_id, actor_id, kind, title, body, resource_type)
  VALUES (me, me, 'friend_request', 'フレンド申請を送信しました', their_name || 'さんにフレンド申請しました', 'friendship');
END;
$function$;
