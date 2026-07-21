import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, ChevronRight, CirclePlus, Compass, Heart, LogOut, MessageCircle, Palette, Search, Settings, Sparkles, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; hobby_tags: string[]; theme_color: string };
type Recruitment = { id: string; title: string; body: string; min_age: number | null; max_age: number | null; hobby_tags: string[]; created_at: string };
type Community = { id: string; name: string; description: string | null; image_url: string | null };
type Post = { id: string; body: string | null; created_at: string };

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

function HomePage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<"home" | "search" | "chat" | "notifications" | "profile">("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [unread, setUnread] = useState(0);
  const [modal, setModal] = useState<"recruit" | "community" | "post" | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    const [profileRes, recruitRes, communityRes, postRes, notificationRes] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,avatar_url,bio,hobby_tags,theme_color").eq("id", user.id).single(),
      supabase.from("friend_recruitments").select("id,title,body,min_age,max_age,hobby_tags,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(6),
      supabase.from("communities").select("id,name,description,image_url").eq("is_dissolved", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("posts").select("id,body,created_at").order("created_at", { ascending: false }).range(0, 9),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    ]);
    if (profileRes.data) setProfile(profileRes.data as Profile);
    setRecruitments((recruitRes.data ?? []) as Recruitment[]); setCommunities((communityRes.data ?? []) as Community[]); setPosts((postRes.data ?? []) as Post[]); setUnread(notificationRes.count ?? 0);
  }

  useEffect(() => { load(); const channel = supabase.channel(`home-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe(); return () => { supabase.removeChannel(channel); }; }, [user.id]);

  async function submitRecruitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("保存中…"); const f = new FormData(event.currentTarget);
    const min = Number(f.get("minAge")); const max = Number(f.get("maxAge"));
    const { error } = await supabase.from("friend_recruitments").insert({ author_id: user.id, title: String(f.get("title")), body: String(f.get("body")), min_age: min || null, max_age: max || null, gender_condition: String(f.get("gender")) || null, hobby_tags: String(f.get("tags")).split(",").map((v) => v.trim()).filter(Boolean) });
    if (error) return setStatus(error.message); setModal(null); setStatus(""); await load();
  }
  async function submitCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("作成中…"); const f = new FormData(event.currentTarget);
    const { error } = await supabase.rpc("create_community", { _name: String(f.get("name")), _description: String(f.get("description")) || undefined, _image_url: undefined });
    if (error) return setStatus(error.message); setModal(null); setStatus(""); await load();
  }
  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const { error } = await supabase.from("posts").insert({ author_id: user.id, body: String(f.get("body")) });
    if (error) return setStatus(error.message); setModal(null); setStatus(""); await load();
  }

  return <MobileShell active={tab} onChange={setTab} unread={unread}>
    <header className="app-header"><div><p>こんにちは、</p><h1>{profile?.display_name ?? "ゲスト"}さん</h1></div><button className="header-avatar" onClick={() => setTab("profile")} aria-label="プロフィールを開く">{profile?.display_name?.slice(0, 1) ?? "?"}</button></header>
    {tab === "home" && <main className="home-view">
      <section className="welcome-strip"><div><Sparkles size={20} /><p>今日も素敵なつながりを<br /><strong>見つけにいこう</strong></p></div><button onClick={() => setTab("search")}>探す<ChevronRight size={18} /></button></section>
      <div className="section-heading"><h2>ショートカット</h2><button><Settings size={16} />編集</button></div>
      <section className="shortcut-grid">
        <button onClick={() => setTab("search")}><span className="shortcut-icon coral"><UsersRound /></span><b>フレンド</b><small>友達を探す</small></button>
        <button onClick={() => setModal("recruit")}><span className="shortcut-icon mint"><Heart /></span><b>フレンド募集</b><small>募集を投稿</small></button>
        <button onClick={() => setModal("community")}><span className="shortcut-icon blue"><Compass /></span><b>コミュニティ</b><small>仲間と話す</small></button>
        <button onClick={() => setTab("chat")}><span className="shortcut-icon yellow"><MessageCircle /></span><b>チャット</b><small>メッセージ</small></button>
      </section>
      <div className="section-heading"><h2>新着のフレンド募集</h2><button onClick={() => setTab("search")}>すべて見る<ChevronRight size={16} /></button></div>
      <section className="recruit-list">{recruitments.length ? recruitments.slice(0, 3).map((item) => <article key={item.id}><div className="mini-avatar">つ</div><div><h3>{item.title}</h3><p>{item.body}</p><div className="tag-row">{item.min_age && <span>{item.min_age}〜{item.max_age ?? ""}歳</span>}{item.hobby_tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div></div><button aria-label="詳しく見る"><ChevronRight /></button></article>) : <div className="empty-state">最初の募集を投稿してみましょう</div>}</section>
      <div className="section-heading"><h2>コミュニティ</h2><button onClick={() => setModal("community")}><CirclePlus size={16} />作成</button></div>
      <section className="community-row">{communities.map((c) => <article key={c.id}><div className="community-art"><UsersRound /></div><b>{c.name}</b><small>{c.description ?? "新しいコミュニティ"}</small></article>)}{!communities.length && <div className="empty-state wide">コミュニティを作ると、作成者としてすぐ参加できます</div>}</section>
      <div className="section-heading"><h2>タイムライン</h2><button onClick={() => setModal("post")}><CirclePlus size={16} />投稿</button></div>
      <section className="timeline-preview">{posts.slice(0, 3).map((p) => <article key={p.id}><div className="mini-avatar">☺</div><p>{p.body}</p><Heart size={18} /></article>)}{!posts.length && <div className="empty-state">まだ投稿はありません</div>}</section>
    </main>}
    {tab === "search" && <main className="simple-view"><div className="page-title"><Search /><div><p>つながりを見つける</p><h2>フレンド</h2></div></div><div className="search-box"><Search size={18} /><input placeholder="名前・趣味タグで検索" /></div><button className="primary-action" onClick={() => setModal("recruit")}><CirclePlus size={18} />フレンド募集を投稿</button><section className="recruit-list full">{recruitments.map((item) => <article key={item.id}><div className="mini-avatar">友</div><div><h3>{item.title}</h3><p>{item.body}</p><div className="tag-row"><span>{item.min_age ?? 18}〜{item.max_age ?? "制限なし"}歳</span>{item.hobby_tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div></article>)}</section></main>}
    {tab === "chat" && <main className="simple-view"><div className="page-title"><MessageCircle /><div><p>リアルタイムで話そう</p><h2>チャット</h2></div></div><div className="empty-panel"><MessageCircle /><h3>会話を始めましょう</h3><p>フレンドまたは参加中のコミュニティからチャットを開始できます。</p></div></main>}
    {tab === "notifications" && <main className="simple-view"><div className="page-title"><Bell /><div><p>あなたへのお知らせ</p><h2>通知</h2></div></div><div className="empty-panel"><Bell /><h3>{unread ? `${unread}件の未読通知` : "すべて確認済みです"}</h3><p>メッセージ、申請、いいね、コメントをここで確認できます。</p></div></main>}
    {tab === "profile" && <main className="simple-view"><div className="profile-hero"><div className="large-avatar">{profile?.display_name?.slice(0, 1)}</div><h2>{profile?.display_name}</h2><p>@{profile?.username}</p><div className="tag-row">{profile?.hobby_tags.map((t) => <span key={t}>#{t}</span>)}</div></div><button className="settings-row"><Palette />プロフィール・テーマを編集<ChevronRight /></button><button className="settings-row" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />ログアウト<ChevronRight /></button></main>}
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal-sheet" onMouseDown={(e) => e.stopPropagation()}><div className="sheet-handle" /><h2>{modal === "recruit" ? "フレンド募集を投稿" : modal === "community" ? "コミュニティを作成" : "タイムラインへ投稿"}</h2>{modal === "recruit" && <form onSubmit={submitRecruitment}><label>募集タイトル<input name="title" required maxLength={80} /></label><label>本文<textarea name="body" required maxLength={1000} /></label><div className="two-fields"><label>最低年齢<select name="minAge"><option value="">指定なし</option>{Array.from({ length: 83 }, (_, i) => i + 18).map((age) => <option key={age}>{age}</option>)}</select></label><label>最高年齢<select name="maxAge"><option value="">指定なし</option>{Array.from({ length: 83 }, (_, i) => i + 18).map((age) => <option key={age}>{age}</option>)}</select></label></div><label>性別条件<select name="gender"><option value="">指定なし</option><option>女性</option><option>男性</option><option>その他</option></select></label><label>趣味タグ<input name="tags" placeholder="ゲーム, 音楽, カフェ" /></label><button className="primary-action">募集を保存</button></form>}{modal === "community" && <form onSubmit={submitCommunity}><label>コミュニティ名<input name="name" required maxLength={60} /></label><label>説明<textarea name="description" maxLength={1000} /></label><p className="form-hint">作成後、あなたは自動的にオーナー兼管理者として参加します。</p><button className="primary-action">作成して参加</button></form>}{modal === "post" && <form onSubmit={submitPost}><label>投稿内容<textarea name="body" required maxLength={2000} placeholder="今なにしてる？" /></label><button className="primary-action">投稿する</button></form>}{status && <p className="form-notice">{status}</p>}<button className="secondary-action" onClick={() => setModal(null)}>キャンセル</button></section></div>}
  </MobileShell>;
}