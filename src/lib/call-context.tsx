import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

type Phase = "idle" | "ringing" | "connecting" | "active" | "ended";

type CallState = {
  phase: Phase;
  conversationId: string | null;
  messageId: string | null;
  status: string;
  muted: boolean;
  videoOn: boolean;
  startedAt: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  tick: number;
};

type CallApi = CallState & {
  startCall: (conversationId: string) => Promise<void>;
  acceptCall: (conversationId: string, messageId: string) => Promise<void>;
  declineCall: (messageId: string) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  toggleVideo: () => Promise<void>;
};

const initial: CallState = { phase: "idle", conversationId: null, messageId: null, status: "", muted: false, videoOn: false, startedAt: null, localStream: null, remoteStream: null, tick: 0 };
const Ctx = createContext<CallApi | null>(null);

export function useCall() {
  const c = useContext(Ctx);
  if (!c) throw new Error("CallProvider missing");
  return c;
}

export function CallProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [s, setS] = useState<CallState>(initial);
  const patch = useCallback((p: Partial<CallState>) => setS((o) => ({ ...o, ...p })), []);
  const bump = useCallback(() => setS((o) => ({ ...o, tick: o.tick + 1 })), []);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const msgChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const readyRef = useRef(false);
  const makingOfferRef = useRef(false);
  const msgIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { phaseRef.current = s.phase; }, [s.phase]);

  const teardown = useCallback((status: string) => {
    try { chRef.current?.send({ type: "broadcast", event: "bye", payload: { from: userId } }); } catch { /* ignore */ }
    if (chRef.current) supabase.removeChannel(chRef.current);
    if (msgChRef.current) supabase.removeChannel(msgChRef.current);
    chRef.current = null; msgChRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    readyRef.current = false; msgIdRef.current = null;
    setS({ ...initial, phase: "ended", status });
    setTimeout(() => setS((o) => (o.phase === "ended" ? initial : o)), 2500);
  }, [userId]);

  const sendOffer = useCallback(async () => {
    const pc = pcRef.current, ch = chRef.current; if (!pc || !ch) return;
    try {
      makingOfferRef.current = true;
      await pc.setLocalDescription();
      ch.send({ type: "broadcast", event: "sdp", payload: { from: userId, desc: pc.localDescription } });
    } catch (e) { console.error(e); } finally { makingOfferRef.current = false; }
  }, [userId]);

  const setupPeer = useCallback(async (conversationId: string, isCaller: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const remote = new MediaStream();
    pc.ontrack = (ev) => {
      remote.addTrack(ev.track);
      ev.track.onmute = bump; ev.track.onunmute = bump; ev.track.onended = bump;
      if (audioRef.current) { audioRef.current.srcObject = remote; audioRef.current.play().catch(() => {}); }
      bump();
    };
    remote.onremovetrack = bump;
    patch({ localStream: stream, remoteStream: remote });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setS((o) => ({ ...o, phase: "active", status: "通話中", startedAt: o.startedAt ?? Date.now() }));
      } else if (pc.connectionState === "failed") {
        teardown("接続が切れました");
      }
    };
    const ch = supabase.channel(`call-${conversationId}`, { config: { broadcast: { self: false } } });
    chRef.current = ch;
    pc.onicecandidate = (ev) => { if (ev.candidate) ch.send({ type: "broadcast", event: "ice", payload: { from: userId, candidate: ev.candidate.toJSON() } }); };
    pc.onnegotiationneeded = () => { if (readyRef.current) sendOffer(); };
    ch.on("broadcast", { event: "sdp" }, async ({ payload }) => {
      if (!payload || payload.from === userId) return;
      const desc = payload.desc as RTCSessionDescriptionInit;
      const polite = userId < payload.from;
      const collision = desc.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
      if (collision && !polite) return;
      try {
        await pc.setRemoteDescription(desc);
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          ch.send({ type: "broadcast", event: "sdp", payload: { from: userId, desc: pc.localDescription } });
        }
        readyRef.current = true;
      } catch (e) { console.error(e); }
    });
    ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (!payload || payload.from === userId) return;
      try { await pc.addIceCandidate(payload.candidate); } catch { /* ignore */ }
    });
    ch.on("broadcast", { event: "bye" }, ({ payload }) => {
      if (payload?.from === userId) return;
      teardown("相手が通話を終了しました");
    });
    ch.on("broadcast", { event: "join" }, ({ payload }) => {
      if (!payload || payload.from === userId || !isCaller) return;
      readyRef.current = true;
      sendOffer();
    });
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED" && !isCaller) ch.send({ type: "broadcast", event: "join", payload: { from: userId } });
    });
  }, [userId, patch, bump, sendOffer, teardown]);

  const startCall = useCallback(async (conversationId: string) => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "ended") return;
    patch({ ...initial, phase: "ringing", conversationId, status: "相手の応答を待っています…" });
    try {
      const { data, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, kind: "system", body: "call:ringing" }).select("id").single();
      if (error) throw error;
      msgIdRef.current = data.id;
      patch({ messageId: data.id });
      const mch = supabase.channel(`callmsg-${data.id}`).on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `id=eq.${data.id}` },
        (p) => {
          const body = (p.new as { body: string }).body;
          if (body === "call:declined") teardown("相手が通話を拒否しました");
          else if (body === "call:accepted") patch({ phase: "connecting", status: "接続中…" });
          else if (body === "call:ended" && phaseRef.current !== "idle") teardown("通話が終了しました");
        }).subscribe();
      msgChRef.current = mch;
      await setupPeer(conversationId, true);
    } catch (e) {
      teardown(e instanceof Error ? `通話を開始できません: ${e.message}` : "通話を開始できません");
    }
  }, [userId, patch, setupPeer, teardown]);

  const acceptCall = useCallback(async (conversationId: string, messageId: string) => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "ended") return;
    msgIdRef.current = messageId;
    patch({ ...initial, phase: "connecting", conversationId, messageId, status: "接続中…" });
    try {
      await setupPeer(conversationId, false);
      await supabase.rpc("set_call_status", { _message_id: messageId, _status: "accepted" });
    } catch (e) {
      teardown(e instanceof Error ? `マイクを使用できません: ${e.message}` : "通話を開始できません");
    }
  }, [patch, setupPeer, teardown]);

  const declineCall = useCallback(async (messageId: string) => {
    await supabase.rpc("set_call_status", { _message_id: messageId, _status: "declined" });
  }, []);

  const hangup = useCallback(() => {
    const id = msgIdRef.current;
    const wasRinging = phaseRef.current === "ringing";
    if (id) supabase.rpc("set_call_status", { _message_id: id, _status: wasRinging ? "canceled" : "ended" }).then(() => {});
    teardown("通話を終了しました");
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const st = streamRef.current; if (!st) return;
    st.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setS((o) => ({ ...o, muted: !o.muted }));
  }, []);

  const toggleVideo = useCallback(async () => {
    const pc = pcRef.current, st = streamRef.current; if (!pc || !st) return;
    const sender = pc.getSenders().find((x) => x.track?.kind === "video");
    if (sender) {
      sender.track?.stop();
      if (sender.track) st.removeTrack(sender.track);
      pc.removeTrack(sender);
      setS((o) => ({ ...o, videoOn: false, tick: o.tick + 1 }));
    } else {
      try {
        const v = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        const track = v.getVideoTracks()[0];
        st.addTrack(track);
        pc.addTrack(track, st);
        setS((o) => ({ ...o, videoOn: true, tick: o.tick + 1 }));
      } catch (e) {
        patch({ status: e instanceof Error ? `カメラを使用できません: ${e.message}` : "カメラを使用できません" });
      }
    }
  }, [patch]);

  useEffect(() => () => { if (pcRef.current) teardown(""); }, [teardown]);

  return <Ctx.Provider value={{ ...s, startCall, acceptCall, declineCall, hangup, toggleMute, toggleVideo }}>
    {children}
    <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
  </Ctx.Provider>;
}
