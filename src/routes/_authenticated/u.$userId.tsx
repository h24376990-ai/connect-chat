import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type Profile = { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; hobby_tags: string[] };
type FriendshipStatus = "none" | "pending_out" | "pending_in" | "accepted" | "self";

export const Route = createFileRoute("/_authenticated/u/$userId")({ component: UserProfilePage });

function UserProfilePage() {
  const { userId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<FriendshipStatus>("none");
  const [msg, setMsg] = useState("");

  async function load() {
    if (userId === user.id) { setStatus("self"); }
    const { data } = await supabase.from("profiles").select("id,display_name,username,avatar_url,bio,hobby_tags").eq("id", userId).single();
    if (data) setProfile(data as Profile);
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

  const initial = profile?.display_name?.slice(0, 1) ?? "?";

  return <MobileShell active="search" onChange={() => navigate({ to: "/home" })} unread={0}>
    <header className="home-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello">プロフィール</h1>
      <div />
    </header>
    <main className="simple-view">
      {!profile ? <div className="empty-panel"><p>読み込み中…</p></div> : <>
        <div className="profile-hero">
          <div className="large-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initial}</div>
          <h2>{profile.display_name}</h2>
          <p>@{profile.username}</p>
          {profile.bio && <p style={{ marginTop: 8 }}>{profile.bio}</p>}
          <div className="tag-row">{profile.hobby_tags?.map((t) => <span key={t}>#{t}</span>)}</div>
        </div>
        {status === "none" && <button className="pill-primary" onClick={apply}>申請する！</button>}
        {status === "pending_out" && <button className="pill-primary" disabled>申請済み</button>}
        {status === "pending_in" && <button className="pill-primary" disabled>相手から申請中</button>}
        {status === "accepted" && <button className="pill-primary" disabled>フレンド</button>}
        {msg && <p className="form-notice">{msg}</p>}
      </>}
    </main>
  </MobileShell>;
}
