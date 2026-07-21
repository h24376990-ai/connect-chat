import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const navigate = useNavigate();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => navigate({ to: data.user ? "/home" : "/auth", replace: true })); }, [navigate]);
  return <main className="splash-screen"><div className="brand-mark"><span /><span /><span /></div><h1>つながりチャット</h1><p>あなたの居場所を準備しています…</p></main>;
}
