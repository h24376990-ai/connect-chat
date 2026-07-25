import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { ProfileDetailModal } from "@/components/profile-detail-modal";

type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; background_url: string | null; bio: string | null; hobby_tags: string[]; age: number | null; gender: string | null };
type Recruitment = { id: string; title: string; body: string | null; created_at: string };
type FriendshipStatus = "none" | "pending_out" | "pending_in" | "accepted" | "self";

export const Route = createFileRoute("/_authenticated/u/$userId")({ component: UserProfilePage });

const GENDER_LABEL: Record<string, string> = { male: "男性", female: "女性", other: "その他" };

function UserProfilePage() {
  const { userId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [latest, setLatest] = useState<Recruitment | null>(null);
  const [status, setStatus] = useState<FriendshipStatus>("none");
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState(false);

  async function load() {
    if (userId === user.id) setStatus("self");
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,avatar_url,background_url,bio,hobby_tags,age,gender").eq("id", userId).single(),
      supabase.from("friend_recruitments").select("id,title,body,created_at").eq("author_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (p.data) setProfile(p.data as Profile);
    setLatest((r.data ?? null) as Recruitment | null);
    if (userId !== user.id) {
      const { data: f } = await supabase.from("friendships").select("requester_id,addressee_id,status").or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`).maybeSingle();
      if (!f) setStatus("none");
      else if (f.status === "accepted") setStatus("accepted");
      else if (f.requester_id === user.id) setStatus("pending_out");
      else setStatus("pending_in");
    }
  }

  useEffect(() => { load(); }, [userId]);

  async function apply() {
    const { error } = await supabase.rpc("send_friend_request", { _addressee: userId });
    if (error) { setMsg(error.message); return; }
    setStatus("pending_out"); setMsg("フレンド申請を送信しました"); setTimeout(() => setMsg(""), 2000);
  }

  async function openChat() {
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { _other: userId });
    if (error) { setMsg(error.message); return; }
    if (data) navigate({ to: "/chat/$conversationId", params: { conversationId: String(data) } });
  }

  const initial = profile?.display_name?.slice(0, 1) ?? "?";

  return <MobileShell active="search" onChange={() => navigate({ to: "/home" })} unread={0}>
    <header className="home-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello">プロフィール</h1>
      <div />
    </header>
    <main className="simple-view">
      {!profile ? <div className="empty-panel"><p>読み込み中…</p></div> : <>
        <div className="profile-hero" style={profile.background_url ? { background: `center/cover url(${profile.background_url})` } : undefined}>
          <button type="button" onClick={() => setDetail(true)} className="large-avatar" style={{ border: "none", padding: 0, cursor: "pointer" }} aria-label="詳細を表示">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initial}
          </button>
          <h2>{profile.display_name}</h2>
          <p>@{profile.username}</p>
          <div className="tag-row" style={{ marginTop: 8 }}>
            {profile.age != null && <span>{profile.age}歳</span>}
            {profile.gender && <span>{GENDER_LABEL[profile.gender] ?? profile.gender}</span>}
          </div>
          {profile.bio && <p style={{ marginTop: 10 }}>{profile.bio}</p>}
          <div className="tag-row">{profile.hobby_tags?.map((t) => <span key={t}>#{t}</span>)}</div>
        </div>

        {latest && <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="discover-section-head"><div><span className="discover-eyebrow">RECRUIT</span><h3>募集中のひとこと</h3></div></div>
          <article className="card-tile card-tile-green">
            <span className="tile-blob" aria-hidden="true" />
            <h4 className="card-tile-title">{latest.title}</h4>
            {latest.body && <p className="card-tile-body">{latest.body}</p>}
            <span className="card-tile-meta" style={{ marginTop: 6, display: "block" }}>{new Date(latest.created_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
          </article>
        </section>}

        {status === "none" && <button className="pill-primary" onClick={apply}>申請する！</button>}
        {status === "pending_out" && <button className="pill-primary" disabled>申請済み</button>}
        {status === "pending_in" && <button className="pill-primary" disabled>相手から申請中</button>}
        {status === "accepted" && <button className="pill-primary" onClick={openChat}><MessageCircle size={16} style={{ marginRight: 6, verticalAlign: -3 }} />チャットを始める</button>}
        {msg && <p className="form-notice">{msg}</p>}
      </>}
      {detail && profile && <ProfileDetailModal profile={profile} onClose={() => setDetail(false)} />}
    </main>
  </MobileShell>;
}
