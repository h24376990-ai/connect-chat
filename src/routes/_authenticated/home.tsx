import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Bell as BellIcon, ChevronRight, CirclePlus, Globe, LogOut, Megaphone, MessageCircle, MessagesSquare, Palette, Settings, User, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { ProfileDetailModal } from "@/components/profile-detail-modal";
import { ProfileEditor } from "@/components/profile-editor";
import { THEME_COLORS, applyThemeColor } from "@/lib/theme";
import { uploadUserMedia } from "@/lib/media";


type AuthorInfo = { id: string; display_name: string; avatar_url: string | null; background_url: string | null; bio: string | null; age: number | null; gender: string | null; hobby_tags: string[]; username: string };
type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; background_url: string | null; bio: string | null; hobby_tags: string[]; theme_color: string };
type Recruitment = { id: string; author_id: string; title: string; body: string | null; created_at: string; author?: AuthorInfo | null };
type Community = { id: string; owner_id: string; name: string; description: string | null; image_url: string | null; created_at: string };
type CommunityMembership = { community_id: string; status: "pending" | "approved" | "rejected" };
type Notification = { id: string; title: string; body: string | null; created_at: string; read_at: string | null };
type FriendRequest = { id: string; requester_id: string; created_at: string; requester?: AuthorInfo | null };
type Friend = { user_id: string; display_name: string; avatar_url: string | null };
type Post = { id: string; author_id: string; body: string | null; image_urls: string[]; created_at: string; author?: AuthorInfo | null };

function isVideoUrl(url: string) {
  const path = url.split("?")[0].toLowerCase();
  return /\.(mp4|mov|webm|m4v|ogv)$/.test(path);
}

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

type TileTone = "cyan" | "green" | "purple" | "pink" | "orange" | "blue" | "teal" | "magenta";
type Tile = { key: string; label: string; tone: TileTone; icon: React.ReactNode; sub?: string; onClick: () => void; extra?: React.ReactNode };

function HomePage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<"home" | "search" | "community" | "chat" | "notifications" | "profile" | "timeline">("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [unread, setUnread] = useState(0);
  const [modal, setModal] = useState<"recruit" | "community" | "post" | "theme" | "settings" | null>(null);
  const [themeColor, setThemeColor] = useState<string>("#25B7A5");
  const [status, setStatus] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityMemberships, setCommunityMemberships] = useState<Map<string, CommunityMembership["status"]>>(new Map());
  const [detailProfile, setDetailProfile] = useState<AuthorInfo | null>(null);
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postPage, setPostPage] = useState(1);
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const PAGE_SIZE = 10;

  async function load() {
    const [profileRes, recruitRes, notificationRes, notifListRes, friendReqRes, communityRes, membershipRes, postRes] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,avatar_url,background_url,bio,hobby_tags,theme_color").eq("id", user.id).single(),
      supabase.from("friend_recruitments").select("id,author_id,title,body,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(200),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase.from("notifications").select("id,title,body,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("friendships").select("id,requester_id,addressee_id,status,created_at").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from("communities").select("id,owner_id,name,description,image_url,created_at").eq("is_dissolved", false).order("created_at", { ascending: false }).limit(100),
      supabase.from("community_members").select("community_id,status").eq("user_id", user.id),
      supabase.from("posts").select("id,author_id,body,image_urls,created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
      setThemeColor((profileRes.data as Profile).theme_color || "#25B7A5");
      applyThemeColor((profileRes.data as Profile).theme_color);
    }
    const recruits = (recruitRes.data ?? []) as Recruitment[];
    const timelinePosts = ((postRes.data ?? []) as Post[]).map((p) => ({ ...p, image_urls: p.image_urls ?? [] }));
    const allFriendships = (friendReqRes.data ?? []) as Array<{ id: string; requester_id: string; addressee_id: string; status: string; created_at: string }>;
    const pending = allFriendships.filter((f) => f.status === "pending" && f.addressee_id === user.id).map((f) => ({ id: f.id, requester_id: f.requester_id, created_at: f.created_at }));
    const accepted = allFriendships.filter((f) => f.status === "accepted").map((f) => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    const authorIds = Array.from(new Set([...recruits.map((r) => r.author_id), ...timelinePosts.map((p) => p.author_id), ...pending.map((r) => r.requester_id), ...accepted]));
    let authorMap = new Map<string, AuthorInfo>();
    if (authorIds.length) {
      const { data: authors } = await supabase.from("profiles").select("id,username,display_name,avatar_url,background_url,bio,hobby_tags,age,gender").in("id", authorIds);
      authorMap = new Map((authors ?? []).map((a) => [a.id, a as AuthorInfo]));
    }
    recruits.forEach((r) => { r.author = authorMap.get(r.author_id) ?? null; });
    timelinePosts.forEach((p) => { p.author = authorMap.get(p.author_id) ?? null; });
    const reqs: FriendRequest[] = pending.map((p) => ({ ...p, requester: authorMap.get(p.requester_id) ?? null }));
    const fs: Friend[] = accepted.map((id) => { const a = authorMap.get(id); return { user_id: id, display_name: a?.display_name ?? "フレンド", avatar_url: a?.avatar_url ?? null }; });
    setRecruitments(recruits);
    setPosts(timelinePosts);
    setUnread(notificationRes.count ?? 0);
    setNotifications((notifListRes.data ?? []) as Notification[]);
    setFriendRequests(reqs);
    setFriends(fs);
    setCommunities((communityRes.data ?? []) as Community[]);
    setCommunityMemberships(new Map(((membershipRes.data ?? []) as CommunityMembership[]).map((m) => [m.community_id, m.status])));
    const sent = new Set<string>();
    allFriendships.forEach((f) => { const other = f.requester_id === user.id ? f.addressee_id : f.requester_id; if (f.status === "pending" || f.status === "accepted") sent.add(other); });
    setSentRequests(sent);
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

  // Keep lists fresh when switching tabs or returning to the app.
  useEffect(() => { load(); }, [tab]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [user.id]);

  // Online presence: mark online while the app is open, offline on leave.
  useEffect(() => {
    const setOnline = (online: boolean) => supabase.from("profiles").update({ is_online: online, last_seen_at: new Date().toISOString() }).eq("id", user.id);
    setOnline(true);
    const beat = setInterval(() => setOnline(true), 60000);
    const onHide = () => { if (document.visibilityState === "hidden") setOnline(false); else setOnline(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => { setOnline(false); });
    return () => { clearInterval(beat); document.removeEventListener("visibilitychange", onHide); setOnline(false); };
  }, [user.id]);

  async function submitRecruitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("保存中…"); const f = new FormData(event.currentTarget);
    const body = String(f.get("body") ?? "").trim();
    const { error } = await supabase.from("friend_recruitments").insert({ author_id: user.id, title: String(f.get("title")), body: body || null });
    if (error) return setStatus(error.message); setModal(null); setStatus(""); await load();
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setStatus("送信中…");
    const { error } = await supabase.from("feedback").insert({ user_id: user.id, body });
    if (error) return setStatus(error.message);
    form.reset();
    setStatus("ご意見を管理者に送信しました。ありがとうございます！");
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
  async function applyCommunity(communityId: string) {
    setStatus("申請中…");
    const { error } = await supabase.rpc("request_community_membership", { _community_id: communityId });
    if (error) { setStatus(error.message); return; }
    setStatus("コミュニティ参加申請を送りました");
    await load();
    setTimeout(() => setStatus(""), 2000);
  }
  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body && postFiles.length === 0) { setStatus("内容か写真・動画を入れてください"); return; }
    setPosting(true); setStatus("投稿中…");
    try {
      const urls: string[] = [];
      for (const file of postFiles) {
        const limit = file.type.startsWith("video") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > limit) throw new Error(`${file.name} のサイズが大きすぎます`);
        urls.push(await uploadUserMedia(user.id, "posts", file));
      }
      const { error } = await supabase.from("posts").insert({ author_id: user.id, body: body || null, image_urls: urls });
      if (error) throw error;
      form.reset(); setPostFiles([]); setModal(null); setStatus(""); setPostPage(1);
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  }

  async function startDirectChat(otherId: string) {
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { _other: otherId });
    if (error) { setStatus(error.message); return; }
    if (data) navigate({ to: "/chat/$conversationId", params: { conversationId: String(data) } });
  }

  const initial = profile?.display_name?.slice(0, 1) ?? "?";
  const tiles: Tile[] = [
    { key: "profile", label: "プロフィール", tone: "cyan", icon: <User />, onClick: () => setTab("profile"), extra: <div className="tile-mini"><span className="tile-mini-avatar">{initial.slice(0, 2)}</span><small>プロフィールを見る</small></div> },
    { key: "recruit", label: "フレンド募集", tone: "green", icon: <Megaphone />, onClick: () => setTab("search") },
    { key: "community", label: "コミュニティ", tone: "purple", icon: <UsersRound />, onClick: () => setTab("community") },
    { key: "friends", label: "フレンド", tone: "pink", icon: <User />, onClick: () => setTab("search") },
    { key: "chat", label: "チャット", tone: "orange", icon: <MessageCircle />, onClick: () => setTab("chat") },
    { key: "cchat", label: "コミュニティチャット", tone: "blue", icon: <MessagesSquare />, onClick: () => setTab("chat") },
    { key: "timeline", label: "タイムライン", tone: "teal", icon: <Globe />, onClick: () => { setPostPage(1); setTab("timeline"); } },
    { key: "notify", label: "通知", tone: "magenta", icon: <BellIcon />, onClick: () => setTab("notifications") },
  ];

  return <MobileShell active={tab} onChange={setTab} unread={unread}>
    <header className="home-header">
      <h1 className="home-hello">{profile?.display_name ?? "ゲスト"}さん</h1>
      <div className="home-header-actions">
        <button aria-label="テーマ" className="round-btn" onClick={() => setModal("theme")}><Palette size={18} /></button>
        <button aria-label="設定" className="round-btn" onClick={() => { setStatus(""); setModal("settings"); }}><Settings size={18} /></button>
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
    {tab === "community" && <main className="simple-view discover-view">
      <div className="discover-section-head">
        <div><span className="discover-eyebrow">COMMUNITIES</span><h2>コミュニティ</h2></div>
        <button className="ghost-pill" onClick={() => setModal("community")}><CirclePlus size={16} />作成</button>
      </div>
      {status && <p className="form-notice">{status}</p>}
      {communities.length === 0
        ? <div className="empty-panel soft"><UsersRound /><p>まだコミュニティはありません。</p></div>
        : <section className="community-card-list">
          {communities.map((community, index) => {
            const membership = communityMemberships.get(community.id);
            const isOwner = community.owner_id === user.id;
            const label = isOwner || membership === "approved" ? "参加済み" : membership === "pending" ? "申請済み" : "参加申請する";
            return <article key={community.id} className={`community-card card-tile-${(["purple", "cyan", "green", "orange"] as const)[index % 4]}`}>
              <div className="community-card-icon">{community.image_url ? <img src={community.image_url} alt="" /> : <UsersRound size={24} />}</div>
              <div className="community-card-copy"><h3>{community.name}</h3><p>{community.description || "一緒に交流するメンバーを募集中です。"}</p></div>
              <button className="pill-primary community-apply" disabled={isOwner || membership === "approved" || membership === "pending"} onClick={() => applyCommunity(community.id)}>{label}</button>
            </article>;
          })}
        </section>}
    </main>}
    {tab === "search" && <main className="simple-view discover-view">
      {friendRequests.length > 0 && <>
        <div className="discover-section-head">
          <div><span className="discover-eyebrow">REQUESTS</span><h3>届いたフレンド申請</h3></div>
        </div>
        <section className="card-tile-grid">
          {friendRequests.map((req) => {
            const name = req.requester?.display_name ?? "ユーザー";
            const ini = name.slice(0, 1);
            return <article key={req.id} className="card-tile card-tile-pink" onClick={() => navigate({ to: "/u/$userId", params: { userId: req.requester_id } })} style={{ cursor: "pointer" }}>
              <span className="tile-blob" aria-hidden="true" />
              <header className="card-tile-head">
                <button type="button" className="tile-icon tile-icon-pink" onClick={(e) => { e.stopPropagation(); if (req.requester) setDetailProfile(req.requester); }} style={{ border: "none", padding: 0, cursor: "pointer" }}>{req.requester?.avatar_url ? <img src={req.requester.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : ini}</button>
                <span className="card-tile-meta">{new Date(req.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              </header>
              <h4 className="card-tile-title">{name}さんから申請</h4>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <button className="pill-primary" style={{ flex: 1 }} onClick={() => respondFriendRequest(req.id, true)}>承認</button>
                <button className="secondary-action" style={{ flex: 1 }} onClick={() => respondFriendRequest(req.id, false)}>拒否</button>
              </div>
            </article>;
          })}
        </section>
      </>}

      <div className="discover-section-head">
        <div><span className="discover-eyebrow">RECRUITS</span><h3>フレンド募集</h3></div>
        <button className="ghost-pill" onClick={() => setModal("recruit")}><CirclePlus size={16} />投稿</button>
      </div>
      {(() => {
        if (recruitments.length === 0) return <div className="empty-panel soft"><Megaphone /><p>まだ募集はありません。</p></div>;
        const totalPages = Math.max(1, Math.ceil(recruitments.length / PAGE_SIZE));
        const cur = Math.min(page, totalPages);
        const slice = recruitments.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
        const tones: TileTone[] = ["cyan", "green", "orange", "pink", "purple", "teal", "blue", "magenta"];
        return <>
          <section className="card-tile-grid">
            {slice.map((item, i) => {
              const tone = tones[i % tones.length];
              const isMine = item.author_id === user.id;
              const authorInitial = (item.author?.display_name ?? "?").slice(0, 1);
              const alreadySent = sentRequests.has(item.author_id);
              return <article key={item.id} className={`card-tile card-tile-${tone}`} onClick={() => !isMine && navigate({ to: "/u/$userId", params: { userId: item.author_id } })} style={{ cursor: isMine ? "default" : "pointer" }}>
                <span className="tile-blob" aria-hidden="true" />
                <header className="card-tile-head">
                  <button type="button" className={`tile-icon tile-icon-${tone}`} onClick={(e) => { e.stopPropagation(); if (item.author) setDetailProfile(item.author); }} style={{ border: "none", padding: 0, cursor: "pointer" }}>{item.author?.avatar_url ? <img src={item.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : authorInitial}</button>
                  <span className="card-tile-meta">{isMine ? "自分" : (item.author?.display_name ?? "匿名")}・{new Date(item.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
                </header>
                <h4 className="card-tile-title">{item.title}</h4>
                {item.body && <p className="card-tile-body">{item.body}</p>}
                {isMine
                  ? <button className="pill-primary" style={{ marginTop: 8 }} disabled>自分の募集</button>
                  : <button className="pill-primary" style={{ marginTop: 8 }} disabled={alreadySent} onClick={(e) => { e.stopPropagation(); applyFriendRequest(item.author_id); }}>{alreadySent ? "申請済み" : "申請する！"}</button>}
              </article>;
            })}
          </section>
          {totalPages > 1 && <div className="pager"><button className="ghost-pill" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>← 前</button><span className="pager-info">{cur} / {totalPages}</span><button className="ghost-pill" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>次 →</button></div>}
        </>;
      })()}
    </main>}
    {tab === "timeline" && <main className="simple-view discover-view">
      <div className="page-title"><Globe /><div><p>みんなの投稿</p><h2>タイムライン</h2></div></div>
      <form className="timeline-composer" onSubmit={submitPost}>
        <label>投稿内容<textarea name="body" maxLength={2000} placeholder="今なにしてる？" /></label>
        <label className="ghost-pill" style={{ display: "inline-flex", cursor: "pointer" }}>
          <ImagePlus size={16} />写真・動画を選ぶ
          <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={(e) => setPostFiles(Array.from(e.target.files ?? []))} />
        </label>
        {postFiles.length > 0 && <p className="form-hint">{postFiles.map((f) => f.name).join(", ")}</p>}
        <button className="pill-primary" disabled={posting}>{posting ? "投稿中…" : "投稿する"}</button>
      </form>
      {status && <p className="form-notice">{status}</p>}
      {(() => {
        if (posts.length === 0) return <div className="empty-panel soft"><Globe /><p>まだ投稿はありません。</p></div>;
        const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
        const cur = Math.min(postPage, totalPages);
        const slice = posts.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
        return <>
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {slice.map((p) => {
              const isMine = p.author_id === user.id;
              const name = isMine ? "自分" : (p.author?.display_name ?? "ユーザー");
              return <article key={p.id} className="card-tile card-tile-teal" style={{ padding: 14 }}>
                <header className="card-tile-head">
                  <button type="button" className="tile-icon tile-icon-teal" onClick={() => p.author && setDetailProfile(p.author)} style={{ border: "none", padding: 0, cursor: "pointer" }}>
                    {p.author?.avatar_url ? <img src={p.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : name.slice(0, 1)}
                  </button>
                  <span className="card-tile-meta">{name}・{new Date(p.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </header>
                {p.body && <p className="card-tile-body" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{p.body}</p>}
                {p.image_urls.length > 0 && <div style={{ display: "grid", gridTemplateColumns: p.image_urls.length > 1 ? "1fr 1fr" : "1fr", gap: 8, marginTop: 10 }}>
                  {p.image_urls.map((url) => isVideoUrl(url)
                    ? <video key={url} src={url} controls playsInline style={{ width: "100%", borderRadius: 12, background: "#000" }} />
                    : <img key={url} src={url} alt="" loading="lazy" style={{ width: "100%", borderRadius: 12, objectFit: "cover" }} />)}
                </div>}
                {isMine && <button className="secondary-action" style={{ marginTop: 10 }} onClick={async () => { await supabase.from("posts").delete().eq("id", p.id); await load(); }}>削除</button>}
              </article>;
            })}
          </section>
          {totalPages > 1 && <div className="pager"><button className="ghost-pill" disabled={cur <= 1} onClick={() => setPostPage(cur - 1)}>← 前</button><span className="pager-info">{cur} / {totalPages}</span><button className="ghost-pill" disabled={cur >= totalPages} onClick={() => setPostPage(cur + 1)}>次 →</button></div>}
        </>;
      })()}
    </main>}
    {tab === "chat" && <main className="simple-view">
      <div className="page-title"><MessageCircle /><div><p>リアルタイムで話そう</p><h2>チャット</h2></div></div>
      {friends.length === 0
        ? <div className="empty-panel"><MessageCircle /><h3>会話を始めましょう</h3><p>フレンドになるとチャットができます。</p></div>
        : <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {friends.map((f) => (
            <button key={f.user_id} className="friend-row" onClick={() => startDirectChat(f.user_id)}>
              <span className="friend-avatar">{f.avatar_url ? <img src={f.avatar_url} alt="" /> : (f.display_name.slice(0, 1))}</span>
              <span className="friend-name">{f.display_name}</span>
              <MessageCircle size={18} />
            </button>
          ))}
        </section>}
    </main>}
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
    {tab === "profile" && <main className="simple-view">
      <ProfileEditor userId={user.id} onSaved={load} />
      <button className="settings-row" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />ログアウト<ChevronRight /></button>
    </main>}

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal-sheet" onMouseDown={(e) => e.stopPropagation()}><div className="sheet-handle" /><h2>{modal === "recruit" ? "フレンド募集を投稿" : modal === "community" ? "コミュニティを作成" : modal === "settings" ? "設定" : modal === "theme" ? "テーマカラーを編集" : "タイムラインへ投稿"}</h2>{modal === "theme" && <div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{THEME_COLORS.map((c) => (<button type="button" key={c} onClick={() => { setThemeColor(c); applyThemeColor(c); }} style={{ width: 48, height: 48, borderRadius: 14, background: c, border: themeColor === c ? "3px solid #0E4A48" : "3px solid transparent" }} aria-label={c} />))}</div><button className="pill-primary" style={{ marginTop: 16 }} onClick={async () => { const { error } = await supabase.from("profiles").update({ theme_color: themeColor }).eq("id", user.id); if (error) { setStatus(error.message); return; } setStatus("テーマカラーを保存しました"); setModal(null); load(); }}>保存する</button></div>}{modal === "settings" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form onSubmit={submitFeedback}>
        <label>管理者に意見を送る<textarea name="body" required maxLength={2000} placeholder="ご意見・ご要望をお書きください" /></label>
        <button className="pill-primary">意見を送信</button>
      </form>
      <button className="settings-row" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />ログアウト<ChevronRight /></button>
    </div>}{modal === "recruit" && <form onSubmit={submitRecruitment}><label>募集タイトル<input name="title" required maxLength={80} placeholder="ゲーム仲間募集！" /></label><label>ひとこと（空白可）<textarea name="body" maxLength={1000} placeholder="よろしくね" /></label><button className="pill-primary">募集を投稿</button></form>}{modal === "community" && <form onSubmit={submitCommunity}><label>コミュニティ名<input name="name" required maxLength={60} /></label><label>説明<textarea name="description" maxLength={1000} /></label><p className="form-hint">作成後、あなたは自動的にオーナー兼管理者として参加します。</p><button className="pill-primary">作成して参加</button></form>}{modal === "post" && <form onSubmit={submitPost}><label>投稿内容<textarea name="body" required maxLength={2000} placeholder="今なにしてる？" /></label><button className="pill-primary">投稿する</button></form>}{status && <p className="form-notice">{status}</p>}<button className="secondary-action" onClick={() => setModal(null)}>キャンセル</button></section></div>}
    {detailProfile && <ProfileDetailModal profile={detailProfile} onClose={() => setDetailProfile(null)} />}
  </MobileShell>;
}
