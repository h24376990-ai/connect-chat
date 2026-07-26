import { FormEvent, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Image as ImageIcon, Phone, Send, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadUserMedia } from "@/lib/media";

type Message = { id: string; sender_id: string; kind: "text" | "image" | "video" | "audio" | "file"; body: string | null; media_url: string | null; created_at: string };
type Member = { user_id: string; display_name: string; avatar_url: string | null };

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({ component: ChatPage });

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data, error } = await supabase.from("messages").select("id,sender_id,kind,body,media_url,created_at").eq("conversation_id", conversationId).order("created_at").limit(500);
    if (error) { setStatus(error.message); return; }
    const msgs = (data ?? []) as Message[];
    setMessages(msgs);
    const senderIds = Array.from(new Set(msgs.map((m) => m.sender_id)));
    if (senderIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,display_name,avatar_url").in("id", senderIds);
      setMembers(new Map((profs ?? []).map((p) => [p.id, { user_id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }])));
    }
  }

  useEffect(() => {
    load();
    const ch = supabase.channel(`conv-${conversationId}`).on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  async function sendText(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const input = inputRef.current;
    if (!input) return;
    const body = input.value.trim();
    if (!body) return;
    setSending(true);
    setStatus("");
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, kind: "text", body });
    if (error) {
      setStatus(`送信失敗: ${error.message}`);
    } else {
      input.value = "";
    }
    setSending(false);
    input.focus();
  }

  async function sendMedia(kind: "image" | "video", file?: File | null) {
    if (!file) return;
    if (kind === "image" && file.size > MAX_IMAGE) return setStatus("画像は10MB以下にしてください");
    if (kind === "video" && file.size > MAX_VIDEO) return setStatus("動画は50MB以下にしてください");
    setUploading(true); setStatus("送信中…");
    try {
      const url = await uploadUserMedia(user.id, `chat/${conversationId}`, file);
      const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, kind, media_url: url });
      if (error) throw error;
      setStatus("");
    } catch (e) { setStatus(e instanceof Error ? e.message : "送信失敗"); }
    finally { setUploading(false); }
  }

  return <div className="chat-page">
    <header className="chat-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello" style={{ fontSize: 18 }}>チャット</h1>
      <button className="round-btn" aria-label="通話" onClick={() => navigate({ to: "/call/$conversationId", params: { conversationId } })}><Phone size={18} /></button>
    </header>
    <main className="chat-view" ref={scrollRef}>
      {messages.length === 0 && <div className="empty-panel soft"><p>まだメッセージはありません。</p></div>}
      {messages.map((m) => {
        const mine = m.sender_id === user.id;
        const sender = members.get(m.sender_id);
        return <div key={m.id} className={`chat-row ${mine ? "mine" : "theirs"}`}>
          {!mine && <div className="chat-avatar">{sender?.avatar_url ? <img src={sender.avatar_url} alt="" /> : (sender?.display_name?.slice(0, 1) ?? "?")}</div>}
          <div className={`chat-bubble ${mine ? "mine" : ""}`}>
            {m.kind === "text" && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>}
            {m.kind === "image" && m.media_url && <img src={m.media_url} alt="" className="chat-media" />}
            {m.kind === "video" && m.media_url && <video src={m.media_url} controls className="chat-media" />}
            <time>{new Date(m.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        </div>;
      })}
    </main>
    {status && <p className="form-notice chat-status">{status}</p>}
    <form className="chat-composer" onSubmit={sendText}>
      <button type="button" className="round-btn" aria-label="画像" disabled={uploading || sending} onClick={() => imgInput.current?.click()}><ImageIcon size={18} /></button>
      <button type="button" className="round-btn" aria-label="動画" disabled={uploading || sending} onClick={() => vidInput.current?.click()}><Video size={18} /></button>
      <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => sendMedia("image", e.target.files?.[0])} />
      <input ref={vidInput} type="file" accept="video/*" hidden onChange={(e) => sendMedia("video", e.target.files?.[0])} />
      <input ref={inputRef} name="body" placeholder="メッセージを入力…" maxLength={2000} autoComplete="off" disabled={sending} />
      <button className="pill-primary" type="submit" aria-label="送信" disabled={sending}><Send size={16} /></button>
    </form>
  </div>;
}
