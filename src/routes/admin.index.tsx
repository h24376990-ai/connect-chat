import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Inbox, LogOut, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminListFeedback, adminListMessages, adminListUsers, adminStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "管理画面 | ブラウザチャット【サクチャ】" },
      { name: "description", content: "ブラウザチャット【サクチャ】の管理画面（非公開）。" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboardPage,
});

type Stats = { users: number; messages: number; mediaMessages: number; onlineUsers: number; communities: number; recruits: number };
type Message = { id: string; conversation_id: string; sender_id: string; kind: string; body: string | null; media_url: string | null; created_at: string; sender: { display_name: string; username: string } | null };
type Feedback = { id: string; user_id: string; body: string; created_at: string; sender: { display_name: string; username: string } | null };
type UserRow = { id: string; username: string; display_name: string; is_online: boolean; last_seen_at: string | null; created_at: string };

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tab, setTab] = useState<"stats" | "messages" | "media" | "users" | "feedback">("stats");
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [err, setErr] = useState("");

  async function loadAll() {
    try {
      const [s, m, u] = await Promise.all([adminStats(), adminListMessages({ data: { mediaOnly: false, limit: 100 } }), adminListUsers()]);
      setStats(s); setMessages(m as Message[]); setUsers(u as UserRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("管理者") || msg.includes("Unauthorized")) navigate({ to: "/admin/login" });
      else setErr(msg);
    }
  }

  async function loadFeedback() {
    try { setFeedback((await adminListFeedback()) as Feedback[]); } catch (e) { setErr(e instanceof Error ? e.message : ""); }
  }

  async function loadMedia() {
    try { const m = await adminListMessages({ data: { mediaOnly: true, limit: 100 } }); setMessages(m as Message[]); } catch (e) { setErr(e instanceof Error ? e.message : ""); }
  }

  useEffect(() => { loadAll(); }, []);

  async function logout() { await supabase.auth.signOut(); navigate({ to: "/admin/login" }); }

  return <div className="admin-wrap">
    <header className="admin-header">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><ShieldCheck /><h1>ブラウザチャット【サクチャ】 管理サイト</h1></div>
      <button className="secondary-action" onClick={logout}><LogOut size={14} /> ログアウト</button>
    </header>
    <nav className="admin-tabs">
      <button className={tab === "stats" ? "active" : ""} onClick={() => { setTab("stats"); loadAll(); }}>統計</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>登録ユーザー</button>
      <button className={tab === "messages" ? "active" : ""} onClick={() => { setTab("messages"); loadAll(); }}>チャット履歴</button>
      <button className={tab === "feedback" ? "active" : ""} onClick={() => { setTab("feedback"); loadFeedback(); }}>意見箱</button>
      <button className={tab === "media" ? "active" : ""} onClick={() => { setTab("media"); loadMedia(); }}>写真・動画</button>
    </nav>
    {err && <p className="form-notice">{err}</p>}
    {tab === "stats" && stats && <section className="admin-grid">
      <StatCard label="登録ユーザー" value={stats.users} icon={<Users />} />
      <StatCard label="オンライン" value={stats.onlineUsers} icon={<Users />} />
      <StatCard label="送信メッセージ" value={stats.messages} icon={<MessageSquare />} />
      <StatCard label="写真・動画" value={stats.mediaMessages} icon={<MessageSquare />} />
      <StatCard label="コミュニティ" value={stats.communities} icon={<Users />} />
      <StatCard label="募集中" value={stats.recruits} icon={<MessageSquare />} />
    </section>}
    {tab === "users" && <section className="admin-list">
      {users.map((u) => <div key={u.id} className="admin-row">
        <b>{u.display_name}</b><span>@{u.username}</span>
        <span>{u.is_online ? "オンライン" : (u.last_seen_at ? new Date(u.last_seen_at).toLocaleString("ja-JP") : "—")}</span>
        <span>{new Date(u.created_at).toLocaleDateString("ja-JP")}</span>
      </div>)}
    </section>}
    {tab === "feedback" && <section className="admin-list">
      {feedback.length === 0 && <p><Inbox size={14} /> 届いた意見はありません</p>}
      {feedback.map((f) => <div key={f.id} className="admin-msg">
        <div className="admin-msg-head"><b>{f.sender?.display_name ?? "?"}</b><span>@{f.sender?.username ?? "?"}</span><time>{new Date(f.created_at).toLocaleString("ja-JP")}</time></div>
        <p>{f.body}</p>
      </div>)}
    </section>}
    {(tab === "messages" || tab === "media") && <section className="admin-list">
      {messages.length === 0 && <p>データがありません</p>}
      {messages.map((m) => <div key={m.id} className="admin-msg">
        <div className="admin-msg-head"><b>{m.sender?.display_name ?? "?"}</b><span>@{m.sender?.username ?? "?"}</span><time>{new Date(m.created_at).toLocaleString("ja-JP")}</time><small>({m.kind})</small></div>
        {m.body && <p>{m.body}</p>}
        {m.media_url && m.kind === "image" && <img src={m.media_url} alt="" className="admin-media" />}
        {m.media_url && m.kind === "video" && <video src={m.media_url} controls className="admin-media" />}
      </div>)}
    </section>}
  </div>;
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="stat-card"><span className="stat-icon">{icon}</span><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}
