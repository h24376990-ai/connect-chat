import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Bell as BellIcon, ChevronRight, CirclePlus, Globe, LogOut, Megaphone, MessageCircle, MessagesSquare, Palette, Search, Settings, User, Users, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; hobby_tags: string[]; theme_color: string };
type Recruitment = { id: string; author_id: string; title: string; body: string | null; created_at: string; author?: { display_name: string; avatar_url: string | null } | null };
type Community = { id: string; name: string; description: string | null; image_url: string | null };
type Post = { id: string; body: string | null; created_at: string };

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

type TileTone = "cyan" | "green" | "purple" | "pink" | "orange" | "blue" | "teal" | "magenta";
type Tile = { key: string; label: string; tone: TileTone; icon: React.ReactNode; sub?: string; onClick: () => void; extra?: React.ReactNode };

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

  const initial = profile?.display_name?.slice(0, 1) ?? "?";
  const tiles: Tile[] = [
    { key: "profile", label: "プロフィール", tone: "cyan", icon: <User />, onClick: () => setTab("profile"), extra: <div className="tile-mini"><span className="tile-mini-avatar">{initial.slice(0, 2)}</span><small>プロフィールを見る</small></div> },
    { key: "recruit", label: "フレンド募集", tone: "green", icon: <Megaphone />, onClick: () => setModal("recruit") },
    { key: "community", label: "コミュニティ", tone: "purple", icon: <UsersRound />, onClick: () => setModal("community") },
    { key: "friends", label: "フレンド", tone: "pink", icon: <User />, onClick: () => setTab("search") },
    { key: "chat", label: "チャット", tone: "orange", icon: <MessageCircle />, onClick: () => setTab("chat") },
    { key: "cchat", label: "コミュニティチャット", tone: "blue", icon: <MessagesSquare />, onClick: () => setTab("chat") },
    { key: "timeline", label: "タイムライン", tone: "teal", icon: <Globe />, onClick: () => setModal("post") },
    { key: "notify", label: "通知", tone: "magenta", icon: <BellIcon />, onClick: () => setTab("notifications") },
  ];

  return <MobileShell active={tab} onChange={setTab} unread={unread}>
    <header className="home-header">
      <h1 className="home-hello">{profile?.display_name ?? "ゲスト"}さん</h1>
      <div className="home-header-actions">
        <button aria-label="テーマ" className="round-btn"><Palette size={18} /></button>
        <button aria-label="設定" className="round-btn"><Settings size={18} /></button>
      </div>
    </header>
    {tab === "home" && <main className="home-tiles-view">
      <section className="tile-grid">
        {tiles.map((t) => (
          <button key={t.key} className={`tile tile-${t.tone}`} onClick={t.onClick}>
            <span className="tile-blob" aria-hidden="true" />
            <span className={`tile-icon tile-icon-${t.tone}`}>{t.icon}</span>
            <b className="tile-label">{t.label}</b>
            {t.extra}
          </button>
        ))}
      </section>
    </main>}
    {tab === "search" && <main className="simple-view discover-view">
      <div className="page-title"><Search /><div><p>つながりを見つける</p><h2>みつける</h2></div></div>
      <div className="search-box"><Search size={18} /><input placeholder="名前・趣味タグで検索" /></div>

      <div className="discover-section-head">
        <div><span className="discover-eyebrow">FRIENDS</span><h3>フレンド募集</h3></div>
        <button className="ghost-pill" onClick={() => setModal("recruit")}><CirclePlus size={16} />投稿</button>
      </div>
      {recruitments.length === 0 ? <div className="empty-panel soft"><Megaphone /><p>まだ募集がありません。最初の投稿をしてみましょう。</p></div> :
        <section className="card-tile-grid">
          {recruitments.map((item, i) => {
            const tones: TileTone[] = ["green", "cyan", "orange", "pink", "purple", "teal"];
            const tone = tones[i % tones.length];
            return <article key={item.id} className={`card-tile card-tile-${tone}`}>
              <span className="tile-blob" aria-hidden="true" />
              <header className="card-tile-head">
                <span className={`tile-icon tile-icon-${tone}`}><Megaphone /></span>
                <span className="card-tile-meta">{new Date(item.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              </header>
              <h4 className="card-tile-title">{item.title}</h4>
              <p className="card-tile-body">{item.body}</p>
              <div className="tag-row">
                <span className="tag-strong">{item.min_age ?? 18}〜{item.max_age ?? "∞"}歳</span>
                {item.hobby_tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            </article>;
          })}
        </section>
      }

      <div className="discover-section-head">
        <div><span className="discover-eyebrow">COMMUNITIES</span><h3>コミュニティ</h3></div>
        <button className="ghost-pill" onClick={() => setModal("community")}><CirclePlus size={16} />作成</button>
      </div>
      {communities.length === 0 ? <div className="empty-panel soft"><UsersRound /><p>コミュニティはまだありません。作成して仲間を集めましょう。</p></div> :
        <section className="card-tile-grid">
          {communities.map((item, i) => {
            const tones: TileTone[] = ["purple", "blue", "magenta", "teal", "orange", "pink"];
            const tone = tones[i % tones.length];
            return <article key={item.id} className={`card-tile card-tile-${tone}`}>
              <span className="tile-blob" aria-hidden="true" />
              <header className="card-tile-head">
                <span className={`tile-icon tile-icon-${tone}`}><UsersRound /></span>
                <span className="card-tile-meta"><Users size={12} /> グループ</span>
              </header>
              <h4 className="card-tile-title">{item.name}</h4>
              <p className="card-tile-body">{item.description ?? "説明はまだ登録されていません。"}</p>
              <div className="card-tile-cta">参加する<ChevronRight size={14} /></div>
            </article>;
          })}
        </section>
      }
    </main>}
    {tab === "chat" && <main className="simple-view"><div className="page-title"><MessageCircle /><div><p>リアルタイムで話そう</p><h2>チャット</h2></div></div><div className="empty-panel"><MessageCircle /><h3>会話を始めましょう</h3><p>フレンドまたは参加中のコミュニティからチャットを開始できます。</p></div></main>}
    {tab === "notifications" && <main className="simple-view"><div className="page-title"><Bell /><div><p>あなたへのお知らせ</p><h2>通知</h2></div></div><div className="empty-panel"><Bell /><h3>{unread ? `${unread}件の未読通知` : "すべて確認済みです"}</h3><p>メッセージ、申請、いいね、コメントをここで確認できます。</p></div></main>}
    {tab === "profile" && <main className="simple-view"><div className="profile-hero"><div className="large-avatar">{initial}</div><h2>{profile?.display_name}</h2><p>@{profile?.username}</p><div className="tag-row">{profile?.hobby_tags.map((t) => <span key={t}>#{t}</span>)}</div></div><button className="settings-row"><Palette />プロフィール・テーマを編集<ChevronRight /></button><button className="settings-row" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />ログアウト<ChevronRight /></button></main>}
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal-sheet" onMouseDown={(e) => e.stopPropagation()}><div className="sheet-handle" /><h2>{modal === "recruit" ? "フレンド募集を投稿" : modal === "community" ? "コミュニティを作成" : "タイムラインへ投稿"}</h2>{modal === "recruit" && <form onSubmit={submitRecruitment}><label>募集タイトル<input name="title" required maxLength={80} /></label><label>本文<textarea name="body" required maxLength={1000} /></label><div className="two-fields"><label>最低年齢<select name="minAge"><option value="">指定なし</option>{Array.from({ length: 83 }, (_, i) => i + 18).map((age) => <option key={age}>{age}</option>)}</select></label><label>最高年齢<select name="maxAge"><option value="">指定なし</option>{Array.from({ length: 83 }, (_, i) => i + 18).map((age) => <option key={age}>{age}</option>)}</select></label></div><label>性別条件<select name="gender"><option value="">指定なし</option><option>女性</option><option>男性</option><option>その他</option></select></label><label>趣味タグ<input name="tags" placeholder="ゲーム, 音楽, カフェ" /></label><button className="pill-primary">募集を保存</button></form>}{modal === "community" && <form onSubmit={submitCommunity}><label>コミュニティ名<input name="name" required maxLength={60} /></label><label>説明<textarea name="description" maxLength={1000} /></label><p className="form-hint">作成後、あなたは自動的にオーナー兼管理者として参加します。</p><button className="pill-primary">作成して参加</button></form>}{modal === "post" && <form onSubmit={submitPost}><label>投稿内容<textarea name="body" required maxLength={2000} placeholder="今なにしてる？" /></label><button className="pill-primary">投稿する</button></form>}{status && <p className="form-notice">{status}</p>}<button className="secondary-action" onClick={() => setModal(null)}>キャンセル</button></section></div>}
  </MobileShell>;
}
