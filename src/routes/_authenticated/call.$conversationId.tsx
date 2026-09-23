import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/call/$conversationId")({
  head: ({ params }) => ({
    meta: [
      { title: "通話 | ブラウザチャット【サクチャ】" },
      { name: "description", content: "ブラウザチャット【サクチャ】の音声通話機能。ブラウザ上でフレンドとすぐに通話を始められます。" },
      { property: "og:title", content: "通話 | ブラウザチャット【サクチャ】" },
      { property: "og:description", content: "ブラウザ上でフレンドとすぐに音声通話を始められます。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `https://tsuna-chat-hub.lovable.app/call/${params.conversationId}` }],
  }),
  component: CallPage,
});

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

function CallPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [status, setStatus] = useState("接続を準備しています…");
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;

        const pc = new RTCPeerConnection(ICE);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (ev) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = ev.streams[0];
            remoteAudioRef.current.play().catch(() => {});
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setConnected(true);
            setStatus("通話中");
            if (!startedAtRef.current) startedAtRef.current = Date.now();
          } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setStatus("接続が切れました");
          }
        };

        const channel = supabase.channel(`call-${conversationId}`, { config: { broadcast: { self: false } } });
        channelRef.current = channel;

        pc.onicecandidate = (ev) => {
          if (ev.candidate) channel.send({ type: "broadcast", event: "ice", payload: { from: user.id, candidate: ev.candidate.toJSON() } });
        };

        pc.onnegotiationneeded = async () => {
          try {
            makingOfferRef.current = true;
            await pc.setLocalDescription();
            channel.send({ type: "broadcast", event: "sdp", payload: { from: user.id, desc: pc.localDescription } });
          } catch (e) { console.error(e); }
          finally { makingOfferRef.current = false; }
        };

        channel.on("broadcast", { event: "sdp" }, async ({ payload }) => {
          if (!payload || payload.from === user.id) return;
          const desc = payload.desc as RTCSessionDescriptionInit;
          politeRef.current = user.id < payload.from;
          const offerCollision = desc.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
          if (offerCollision && !politeRef.current) return;
          try {
            await pc.setRemoteDescription(desc);
            if (desc.type === "offer") {
              await pc.setLocalDescription();
              channel.send({ type: "broadcast", event: "sdp", payload: { from: user.id, desc: pc.localDescription } });
            }
          } catch (e) { console.error(e); }
        });
        channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
          if (!payload || payload.from === user.id) return;
          try { await pc.addIceCandidate(payload.candidate); } catch (e) { console.error(e); }
        });
        channel.on("broadcast", { event: "bye" }, () => {
          setStatus("相手が通話を終了しました");
          setTimeout(() => hangup(), 800);
        });
        channel.on("broadcast", { event: "join" }, async ({ payload }) => {
          if (!payload || payload.from === user.id) return;
          // Deterministic caller: smaller user id makes the offer
          if (user.id < payload.from) {
            try {
              makingOfferRef.current = true;
              await pc.setLocalDescription(await pc.createOffer());
              channel.send({ type: "broadcast", event: "sdp", payload: { from: user.id, desc: pc.localDescription } });
            } finally { makingOfferRef.current = false; }
          }
        });

        channel.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            setStatus("相手を呼び出しています…");
            channel.send({ type: "broadcast", event: "join", payload: { from: user.id } });
          }
        });
      } catch (e) {
        setStatus(e instanceof Error ? `マイクを使用できません: ${e.message}` : "通話を開始できません");
      }
    }
    start();

    return () => {
      stopped = true;
      try { channelRef.current?.send({ type: "broadcast", event: "bye", payload: { from: user.id } }); } catch { /* ignore */ }
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [conversationId, user.id]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => { if (startedAtRef.current) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)); }, 500);
    return () => clearInterval(t);
  }, [connected]);

  function toggleMute() {
    const s = localStreamRef.current; if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMuted((m) => !m);
  }
  function hangup() {
    navigate({ to: "/chat/$conversationId", params: { conversationId } });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return <div className="call-page">
    <div className="call-inner">
      <div className="call-avatar-large">📞</div>
      <h1 className="call-title">音声通話</h1>
      <p className="call-status">{status}</p>
      {connected && <p className="call-timer">{mm}:{ss}</p>}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="call-controls">
        <button className={`round-btn call-btn ${muted ? "muted" : ""}`} onClick={toggleMute} aria-label={muted ? "ミュート解除" : "ミュート"}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button className="round-btn call-btn hangup" onClick={hangup} aria-label="通話終了"><PhoneOff size={22} /></button>
      </div>
    </div>
  </div>;
}
