import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Bell as BellIcon, ChevronRight, CirclePlus, Globe, LogOut, Megaphone, MessageCircle, MessagesSquare, Palette, Search, Settings, User, Users, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; hobby_tags: string[]; theme_color: string };
type Recruitment = { id: string; author_id: string; title: string; body: string | null; created_at: string; author?: { display_name: string; avatar_url: string | null } | null };
type Community = { id: string; name: string; description: string | null; image_url: string | null };
type Post = { id: string; body: string | null; created_at: string };
type Notification = { id: string; title: string; body: string | null; created_at: string; read_at: string | null };
type FriendRequest = { id: string; requester_id: string; created_at: string; requester?: { display_name: string; avatar_url: string | null } | null };

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [minePage, setMinePage] = useState(1);
  const [othersPage, setOthersPage] = useState(1);
  const PAGE_SIZE = 10;

  async function load() {
    const [profileRes, recruitRes, communityRes, postRes, notificationRes, notifListRes, friendReqRes] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,avatar_url,bio,hobby_tags,theme_color").eq("id", user.id).single(),
      supabase.from("friend_recruitments").select("id,author_id,title,body,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(200),
      supabase.from("communities").select("id,name,description,image_url").eq("is_dissolved", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("posts").select("id,body,created_at").order("created_at", { ascending: false }).range(0, 9),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase.from("notifications").select("id,title,body,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("friendships").select("id,requester_id,created_at").eq("addressee_id", user.id).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data as Profile);
    const recruits = (recruitRes.data ?? []) as Recruitment[];
    const requests = (friendReqRes.data ?? []) as FriendRequest[];
    const authorIds = Array.from(new Set([...recruits.map((r) => r.author_id), ...requests.map((r) => r.requester_id)]));
    if (authorIds.length) {
      const { data: authors } = await supabase.from("profiles").select("id,display_name,avatar_url").in("id", authorIds);
      const map = new Map((authors ?? []).map((a) => [a.id, a]));
      recruits.forEach((r) => { const a = map.get(r.author_id); r.author = a ? { display_name: a.display_name, avatar_url: a.avatar_url } : null; });
      requests.forEach((r) => { const a = map.get(r.requester_id); r.requester = a ? { display_name: a.display_name, avatar_url: a.avatar_url } : null; });
    }
    setRecruitments(recruits); setCommunities((communityRes.data ?? []) as Community[]); setPosts((postRes.data ?? []) as Post[]); setUnread(notificationRes.count ?? 0);
    setNotifications((notifListRes.data ?? []) as Notification[]); setFriendRequests(requests);
  }

  async function respondFriendRequest(id: string, accept: boolean) {
    const { error } = await supabase.from("friendships").update({ status: accept ? "accepted" : "rejected" }).eq("id", id);
    if (error) { setStatus(error.message); return; }
    await load();
  }

  async function markNotificationsRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    await load();
  }

  useEffect(() => { load(); const channel = supabase.channel(`home-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe(); return () => { supabase.removeChannel(channel); }; }, [user.id]);

  async function submitRecruitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("保存中…"); const f = new FormData(event.currentTarget);
    const body = String(f.get("body") ?? "").trim();
    const { error } = await supabase.from("friend_recruitments").insert({ author_id: user.id, title: String(f.get("title")), body: body || null });
    if (error) return setStatus(error.message); setModal(null); setStatus(""); await load();
  }

  async function applyFriendRequest(addresseeId: string) {
    if (addresseeId === user.id) return;
    const { error } = await supabase.rpc("send_friend_request", { _addressee: addresseeId });
    if (error) { setStatus(error.message); return; }
    setStatus("フレンド申請を送信しました"); await load(); setTimeout(() => setStatus(""), 2000);
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
    { key: "recruit", label: "フレンド募集", tone: "green", icon: <Megaphone />, onClick: () => setTab("search") },
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

      {friendRequests.length > 0 && <>
        <div className="discover-section-head">
          <div><span className="discover-eyebrow">REQUESTS</span><h3>届いたフレンド申請</h3></div>
        </div>
        <section className="card-tile-grid">
          {friendRequests.map((req) => {
            const name = req.requester?.display_name ?? "ユーザー";
            const ini = name.slice(0, 1);
            return <article key={req.id} className="card-tile card-tile-pink">
              <span className="tile-blob" aria-hidden="true" />
              <header className="card-tile-head">
                <span className="tile-icon tile-icon-pink">{req.requester?.avatar_url ? <img src={req.requester.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : ini}</span>
                <span className="card-tile-meta">{new Date(req.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              </header>
              <h4 className="card-tile-title">{name}さんから申請</h4>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="pill-primary" style={{ flex: 1 }} onClick={() => respondFriendRequest(req.id, true)}>承認</button>
                <button className="secondary-action" style={{ flex: 1 }} onClick={() => respondFriendRequest(req.id, false)}>拒否</button>
              </div>
            </article>;
          })}
        </section>
      </>}


      <div className="discover-section-head">
        <div><span className="discover-eyebrow">FRIENDS</span><h3>フレンド募集</h3></div>
        <button className="ghost-pill" onClick={() => setModal("recruit")}><CirclePlus size={16} />投稿</button>
      </div>
      {recruitments.length === 0 ? <div className="empty-panel soft"><Megaphone /><p>まだ募集がありません。最初の投稿をしてみましょう。</p></div> :
        <section className="card-tile-grid">
          {recruitments.map((item, i) => {
            const tones: TileTone[] = ["green", "cyan", "orange", "pink", "purple", "teal"];
            const tone = tones[i % tones.length];
            const authorInitial = (item.author?.display_name ?? "?").slice(0, 1);
            const isMine = item.author_id === user.id;
            return <article key={item.id} className={`card-tile card-tile-${tone}`}>
              <span className="tile-blob" aria-hidden="true" />
              <header className="card-tile-head">
                <span className={`tile-icon tile-icon-${tone}`}>{item.author?.avatar_url ? <img src={item.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : authorInitial}</span>
                <span className="card-tile-meta">{item.author?.display_name ?? "匿名"}・{new Date(item.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              </header>
              <h4 className="card-tile-title">{item.title}</h4>
              {item.body && <p className="card-tile-body">{item.body}</p>}
              <button className="pill-primary" style={{ marginTop: 8 }} disabled={isMine} onClick={() => applyFriendRequest(item.author_id)}>{isMine ? "自分の募集" : "申請する！"}</button>
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
    {tab === "notifications" && <main className="simple-view">
      <div className="page-title"><Bell /><div><p>あなたへのお知らせ</p><h2>通知</h2></div></div>
      {unread > 0 && <button className="ghost-pill" onClick={markNotificationsRead} style={{ alignSelf: "flex-end" }}>すべて既読</button>}
      {notifications.length === 0 ? <div className="empty-panel"><Bell /><h3>通知はまだありません</h3><p>メッセージ、申請、いいね、コメントをここで確認できます。</p></div> :
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.map((n) => <article key={n.id} className={`card-tile ${n.read_at ? "card-tile-blue" : "card-tile-magenta"}`} style={{ padding: 14 }}>
            <h4 className="card-tile-title" style={{ fontSize: 14 }}>{n.title}</h4>
            {n.body && <p className="card-tile-body" style={{ marginTop: 4 }}>{n.body}</p>}
            <span className="card-tile-meta" style={{ marginTop: 6, display: "block" }}>{new Date(n.created_at).toLocaleString("ja-JP")}</span>
          </article>)}
        </section>
      }
    </main>}
    {tab === "profile" && <main className="simple-view"><div className="profile-hero"><div className="large-avatar">{initial}</div><h2>{profile?.display_name}</h2><p>@{profile?.username}</p><div className="tag-row">{profile?.hobby_tags.map((t) => <span key={t}>#{t}</span>)}</div></div><button className="settings-row"><Palette />プロフィール・テーマを編集<ChevronRight /></button><button className="settings-row" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />ログアウト<ChevronRight /></button></main>}
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal-sheet" onMouseDown={(e) => e.stopPropagation()}><div className="sheet-handle" /><h2>{modal === "recruit" ? "フレンド募集を投稿" : modal === "community" ? "コミュニティを作成" : "タイムラインへ投稿"}</h2>{modal === "recruit" && <form onSubmit={submitRecruitment}><label>募集タイトル<input name="title" required maxLength={80} placeholder="ゲーム仲間募集！" /></label><label>ひとこと（空白可）<textarea name="body" maxLength={1000} placeholder="よろしくね" /></label><button className="pill-primary">募集を投稿</button></form>}{modal === "community" && <form onSubmit={submitCommunity}><label>コミュニティ名<input name="name" required maxLength={60} /></label><label>説明<textarea name="description" maxLength={1000} /></label><p className="form-hint">作成後、あなたは自動的にオーナー兼管理者として参加します。</p><button className="pill-primary">作成して参加</button></form>}{modal === "post" && <form onSubmit={submitPost}><label>投稿内容<textarea name="body" required maxLength={2000} placeholder="今なにしてる？" /></label><button className="pill-primary">投稿する</button></form>}{status && <p className="form-notice">{status}</p>}<button className="secondary-action" onClick={() => setModal(null)}>キャンセル</button></section></div>}
  </MobileShell>;
}
