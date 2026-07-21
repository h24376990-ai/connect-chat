CREATE TABLE public.login_aliases (
  user_id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  email text NOT NULL UNIQUE CHECK (char_length(email) <= 254),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_aliases TO service_role;
ALTER TABLE public.login_aliases ENABLE ROW LEVEL SECURITY;
CREATE INDEX login_aliases_username_lower_idx ON public.login_aliases (lower(username));