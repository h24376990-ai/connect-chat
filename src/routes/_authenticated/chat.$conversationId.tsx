import { FormEvent, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Image as ImageIcon, Phone, PhoneCall, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadUserMedia } from "@/lib/media";
import { useCall } from "@/lib/call-context";

type Message = { id: string; sender_id: string; kind: "text" | "image" | "video" | "system"; body: string | null; media_url: string | null; created_at: string; pending?: boolean };
type Member = { user_id: string; display_name: string; avatar_url: string | null };

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;
const COLS = "id,sender_id,kind,body,media_url,created_at";

const CALL_LABEL: Record<string, string> = {
  "call:ringing": "通話待機中",
  "call:accepted": "通話中",
  "call:declined": "通話が拒否されました",
  "call:ended": "通話は終了しました",
  "call:canceled": "通話はキャンセルされました",
};

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  head: ({ params }) => ({
    meta: [
      { title: "チャット | ブラウザチャット【Convo】" },
      { name: "description", content: "ブラウザチャット【Convo】の1対1リアルタイムチャット。テキスト・画像・動画を送ってフレンドと楽しく会話できます。" },
      { property: "og:title", content: "チャット | ブラウザチャット【Convo】" },
      { property: "og:description", content: "テキスト・画像・動画を送ってフレンドとリアルタイムチャット。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `https://tsunagari-chat.vercel.app/chat/${params.conversationId}` }],
  }),
  component: ChatPage,
});

function upsert(list: Message[], m: Message, replaceId?: string): Message[] {
  const without = list.filter((x) => x.id !== m.id && x.id !== replaceId);
  const next = [...without, m];
  next.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return next;
}

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const call = useCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const membersRef = useRef(members);
  membersRef.current = members;

  async function loadProfiles(ids: string[]) {
    const missing = ids.filter((id) => !membersRef.current.has(id));
    if (!missing.length) return;
    const { data: profs } = await supabase.from("profiles").select("id,display_name,avatar_url").in("id", missing);
    setMembers((old) => {
      const m = new Map(old);
      (profs ?? []).forEach((p) => m.set(p.id, { user_id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
      return m;
    });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("messages").select(COLS).eq("conversation_id", conversationId).order("created_at").limit(500);
      if (!alive) return;
      if (error) { setStatus(error.message); return; }
      const msgs = (data ?? []) as Message[];
      setMessages(msgs);
      loadProfiles(Array.from(new Set(msgs.map((m) => m.sender_id))));
    })();
    const ch = supabase.channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (p) => { const m = p.new as Message; setMessages((l) => upsert(l, m)); loadProfiles([m.sender_id]); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (p) => { const m = p.new as Message; setMessages((l) => upsert(l, m)); })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [conversationId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  async function sendText(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    input.focus();
    setStatus("");
    const tempId = `tmp-${crypto.randomUUID()}`;
    setMessages((l) => [...l, { id: tempId, sender_id: user.id, kind: "text", body, media_url: null, created_at: new Date().toISOString(), pending: true }]);
    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, kind: "text", body }).select(COLS).single();
    if (error) {
      setMessages((l) => l.filter((m) => m.id !== tempId));
      setStatus(`送信失敗: ${error.message}`);
      input.value = body;
    } else {
      setMessages((l) => upsert(l, data as Message, tempId));
    }
  }

  async function sendMedia(file?: File | null) {
    if (!file) return;
    const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    if (kind === "image" && file.size > MAX_IMAGE) return setStatus("画像は10MB以下にしてください");
    if (kind === "video" && file.size > MAX_VIDEO) return setStatus("動画は50MB以下にしてください");
    setUploading(true); setStatus("");
    const tempId = `tmp-${crypto.randomUUID()}`;
    const preview = URL.createObjectURL(file);
    setMessages((l) => [...l, { id: tempId, sender_id: user.id, kind, body: null, media_url: preview, created_at: new Date().toISOString(), pending: true }]);
    try {
      const url = await uploadUserMedia(user.id, `chat/${conversationId}`, file);
      const { data, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, kind, media_url: url }).select(COLS).single();
      if (error) throw error;
      setMessages((l) => upsert(l, data as Message, tempId));
    } catch (e) {
      setMessages((l) => l.filter((m) => m.id !== tempId));
      setStatus(e instanceof Error ? e.message : "送信失敗");
    } finally {
      setUploading(false);
      if (mediaInput.current) mediaInput.current.value = "";
    }
  }

  const goCall = () => navigate({ to: "/call/$conversationId", params: { conversationId } });
  const inThisCall = call.conversationId === conversationId && ["ringing", "connecting", "active"].includes(call.phase);
  const busyElsewhere = !inThisCall && ["ringing", "connecting", "active"].includes(call.phase);

  async function onCallButton() {
    if (inThisCall) return goCall();
    if (busyElsewhere) return setStatus("別の通話中です");
    await call.startCall(conversationId);
    goCall();
  }

  async function accept(m: Message) {
    if (busyElsewhere || inThisCall) return setStatus("別の通話中です");
    await call.acceptCall(conversationId, m.id);
    goCall();
  }

  return <div className="chat-page">
    <header className="chat-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello" style={{ fontSize: 18 }}>チャット</h1>
      <button className="round-btn" aria-label="通話" onClick={onCallButton}><Phone size={18} /></button>
    </header>
    {inThisCall && <button className="call-return-bar" onClick={goCall}>
      <PhoneCall size={16} /> {call.phase === "ringing" ? "相手の応答を待っています" : call.phase === "active" ? "通話中" : "接続中"} — タップで通話画面に戻る
    </button>}
    <main className="chat-view" ref={scrollRef}>
      {messages.length === 0 && <div className="empty-panel soft"><p>まだメッセージはありません。</p></div>}
      {messages.map((m) => {
        const mine = m.sender_id === user.id;
        const sender = members.get(m.sender_id);
        const time = new Date(m.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
        if (m.kind === "system" && m.body?.startsWith("call:")) {
          const ringing = m.body === "call:ringing";
          return <div key={m.id} className={`chat-row ${mine ? "mine" : "theirs"}`}>
            <div className="call-msg">
              <div className="call-msg-top"><PhoneCall size={16} /> {CALL_LABEL[m.body] ?? "通話"}</div>
              <div className="call-msg-bottom">
                {ringing && !mine && <>
                  <button className="call-msg-btn decline" onClick={() => call.declineCall(m.id)}>拒否</button>
                  <button className="call-msg-btn accept" onClick={() => accept(m)}>応答</button>
                </>}
                {ringing && mine && <span className="call-msg-note">{mine ? "相手の応答待ち" : ""}</span>}
                {!ringing && <time>{time}</time>}
              </div>
            </div>
          </div>;
        }
        return <div key={m.id} className={`chat-row ${mine ? "mine" : "theirs"}`}>
          {!mine && <div className="chat-avatar">{sender?.avatar_url ? <img src={sender.avatar_url} alt="" /> : (sender?.display_name?.slice(0, 1) ?? "?")}</div>}
          <div className={`chat-bubble ${mine ? "mine" : ""}`} style={m.pending ? { opacity: 0.7 } : undefined}>
            {m.kind === "text" && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>}
            {m.kind === "image" && m.media_url && <img src={m.media_url} alt="" className="chat-media" />}
            {m.kind === "video" && m.media_url && <video src={m.media_url} controls className="chat-media" />}
            <time>{m.pending ? "送信中…" : time}</time>
          </div>
        </div>;
      })}
    </main>
    {status && <p className="form-notice chat-status">{status}</p>}
    <form className="chat-composer" onSubmit={sendText}>
      <button type="button" className="round-btn" aria-label="写真・動画" disabled={uploading} onClick={() => mediaInput.current?.click()}><ImageIcon size={18} /></button>
      <input ref={mediaInput} type="file" accept="image/*,video/*" hidden onChange={(e) => sendMedia(e.target.files?.[0])} />
      <input ref={inputRef} name="body" placeholder="メッセージを入力…" maxLength={2000} autoComplete="off" />
      <button className="pill-primary" type="submit" aria-label="送信"><Send size={16} /></button>
    </form>
  </div>;
}
