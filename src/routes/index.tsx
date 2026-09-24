import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SITE_URL = "https://tsuna-chat-hub.lovable.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ブラウザチャット【サクチャ】｜登録不要で今すぐ話せる無料ツール" },
      { name: "description", content: "アカウント登録やアプリのインストールは一切不要！URLを発行して相手に送るだけで、ブラウザ上ですぐにリアルタイムチャットが始められる無料ツール「サクチャ」です。履歴も残らない安心設計。" },
      { property: "og:title", content: "ブラウザチャット【サクチャ】｜登録不要で今すぐ話せる無料ツール" },
      { property: "og:description", content: "アカウント登録やアプリのインストールは一切不要！URLを発行して相手に送るだけで、ブラウザ上ですぐにリアルタイムチャットが始められる無料ツール「サクチャ」です。履歴も残らない安心設計。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const navigate = useNavigate();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => navigate({ to: data.user ? "/home" : "/auth", replace: true })); }, [navigate]);
  return <main className="splash-screen"><div className="brand-mark"><span /><span /><span /></div><h1>ブラウザチャット【サクチャ】</h1><p>登録不要で今すぐ話せる無料ツール</p></main>;
}
