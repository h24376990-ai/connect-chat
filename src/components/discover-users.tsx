import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileDetailModal } from "@/components/profile-detail-modal";

type P = { id: string; username: string; display_name: string; avatar_url: string | null; background_url: string | null; bio: string | null; age: number | null; gender: string | null; hobby_tags: string[] };
type Rel = "none" | "sent" | "received" | "friend";
const PAGE = 10;

export function DiscoverUsers({ userId }: { userId: string }) {
  const [rows, setRows] = useState<P[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [rel, setRel] = useState<Map<string, Rel>>(new Map());
  const [detail, setDetail] = useState<P | null>(null);
  const [msg, setMsg] = useState("");

  const loadRel = useCallback(async () => {
    const { data } = await supabase.from("friendships").select("requester_id,addressee_id,status").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const m = new Map<string, Rel>();
    (data ?? []).forEach((f) => {
      if (f.status === "rejected") return;
      const other = f.requester_id === userId ? f.addressee_id : f.requester_id;
      m.set(other, f.status === "accepted" ? "friend" : f.requester_id === userId ? "sent" : "received");
    });
    setRel(m);
  }, [userId]);

  useEffect(() => {
    (async () => {
      const from = (page - 1) * PAGE;
      const { data, count } = await supabase.from("profiles").select("id,username,display_name,avatar_url,background_url,bio,age,gender,hobby_tags", { count: "exact" }).neq("id", userId).order("created_at", { ascending: true }).range(from, from + PAGE - 1);
      setRows((data ?? []) as P[]); setTotal(count ?? 0);
    })();
    loadRel();
  }, [page, userId, loadRel]);

  async function apply(id: string) {
    const { error } = await supabase.rpc("send_friend_request", { _addressee: id });
    if (error) { setMsg(error.message); return; }
    setMsg("フレンド申請を送信しました"); await loadRel(); setTimeout(() => setMsg(""), 2000);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const label: Record<Rel, string> = { none: "申請する", sent: "申請済み", received: "相手から申請中", friend: "フレンド" };
  return <>
    {msg && <p className="form-notice">{msg}</p>}
    {rows.length === 0 ? <div className="empty-panel soft"><p>まだ他の登録者はいません。</p></div> :
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((p) => {
          const r = rel.get(p.id) ?? "none";
          return <article key={p.id} className="card-tile card-tile-cyan" onClick={() => setDetail(p)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexDirection: "row" }}>
            <span className="tile-icon tile-icon-cyan" style={{ flexShrink: 0 }}>{p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : p.display_name.slice(0, 1)}</span>
            <div style={{ flex: 1, minWidth: 0 }}><h4 className="card-tile-title" style={{ margin: 0 }}>{p.display_name}</h4><small style={{ opacity: 0.7 }}>@{p.username}</small></div>
            <button className="pill-primary" style={{ width: "auto", padding: "8px 14px" }} disabled={r !== "none"} onClick={(e) => { e.stopPropagation(); apply(p.id); }}>{label[r]}</button>
          </article>;
        })}
      </section>}
    <div className="pager"><button className="ghost-pill" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 前</button><span className="pager-info">{page} / {totalPages}</span><button className="ghost-pill" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>次 →</button></div>
    {detail && <ProfileDetailModal profile={detail} onClose={() => setDetail(null)} />}
  </>;
}
