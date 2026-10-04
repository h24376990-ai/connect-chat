import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCall } from "@/lib/call-context";

export const Route = createFileRoute("/_authenticated/call/$conversationId")({
  head: ({ params }) => ({
    meta: [
      { title: "通話 | ブラウザチャット【サクチャ】" },
      { name: "description", content: "ブラウザチャット【サクチャ】の音声・ビデオ通話機能。ブラウザ上でフレンドとすぐに通話を始められます。" },
      { property: "og:title", content: "通話 | ブラウザチャット【サクチャ】" },
      { property: "og:description", content: "ブラウザ上でフレンドとすぐに音声・ビデオ通話を始められます。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `https://tsunagari-chat.vercel.app/call/${params.conversationId}` }],
  }),
  component: CallPage,
});

function CallPage() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const call = useCall();
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(Date.now());

  const isThis = call.conversationId === conversationId;
  const remoteVideo = isThis && !!call.remoteStream?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);

  useEffect(() => { if (remoteRef.current && call.remoteStream) remoteRef.current.srcObject = call.remoteStream; }, [call.remoteStream, remoteVideo, call.tick]);
  useEffect(() => { if (localRef.current && call.localStream) localRef.current.srcObject = call.localStream; }, [call.localStream, call.videoOn]);
  useEffect(() => { if (call.phase !== "active") return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [call.phase]);

  const backToChat = () => navigate({ to: "/chat/$conversationId", params: { conversationId } });
  useEffect(() => {
    if (call.phase === "idle") { const t = setTimeout(backToChat, 300); return () => clearTimeout(t); }
  }, [call.phase]);

  const elapsed = call.startedAt ? Math.max(0, Math.floor((now - call.startedAt) / 1000)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const live = isThis && (call.phase === "ringing" || call.phase === "connecting" || call.phase === "active");

  return <div className="call-page">
    {remoteVideo && <video ref={remoteRef} className="call-remote-video" autoPlay playsInline muted />}
    {live && call.videoOn && <video ref={localRef} className="call-local-video" autoPlay playsInline muted />}
    <div className="call-inner">
      {!remoteVideo && <div className="call-avatar-large">📞</div>}
      <h1 className="call-title">{call.videoOn || remoteVideo ? "ビデオ通話" : "音声通話"}</h1>
      <p className="call-status">{isThis || call.phase === "ended" ? call.status : "通話はありません"}</p>
      {live && call.phase === "active" && <p className="call-timer">{mm}:{ss}</p>}
      <div className="call-controls">
        <button className="round-btn call-btn" onClick={backToChat} aria-label="チャットに戻る"><MessageCircle size={22} /></button>
        {live && <>
          <button className={`round-btn call-btn ${call.muted ? "muted" : ""}`} onClick={call.toggleMute} aria-label={call.muted ? "ミュート解除" : "ミュート"}>
            {call.muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button className={`round-btn call-btn ${call.videoOn ? "muted" : ""}`} onClick={call.toggleVideo} aria-label={call.videoOn ? "音声のみに切り替え" : "ビデオに切り替え"}>
            {call.videoOn ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
          <button className="round-btn call-btn hangup" onClick={call.hangup} aria-label="通話終了"><PhoneOff size={22} /></button>
        </>}
      </div>
    </div>
  </div>;
}
