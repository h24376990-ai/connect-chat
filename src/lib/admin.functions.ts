import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INTERNAL_EMAIL_DOMAIN = "users.tsunagari.local";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("管理者権限がありません");
}

export const adminSignIn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(6).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const loginId = data.email.includes("@") ? data.email : `${data.email}@${INTERNAL_EMAIL_DOMAIN}`;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("認証サービスに接続できません");
    const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signErr } = await authClient.auth.signInWithPassword({ email: loginId, password: data.password });
    if (signErr || !session.session) throw new Error("ユーザーIDまたはパスワードが正しくありません");

    await assertAdmin(session.user!.id);
    return { accessToken: session.session.access_token, refreshToken: session.session.refresh_token };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, messages, mediaMessages, onlineUsers, communities, recruits] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).not("media_url", "is", null),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_online", true),
      supabaseAdmin.from("communities").select("id", { count: "exact", head: true }).eq("is_dissolved", false),
      supabaseAdmin.from("friend_recruitments").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    return {
      users: users.count ?? 0, messages: messages.count ?? 0,
      mediaMessages: mediaMessages.count ?? 0, onlineUsers: onlineUsers.count ?? 0,
      communities: communities.count ?? 0, recruits: recruits.count ?? 0,
    };
  });

export const adminListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ mediaOnly: z.boolean().optional(), limit: z.number().min(1).max(200).optional() }).parse(input ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("messages").select("id,conversation_id,sender_id,kind,body,media_url,created_at").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.mediaOnly) q = q.not("media_url", "is", null);
    const { data: msgs, error } = await q;
    if (error) throw error;
    const senderIds = Array.from(new Set((msgs ?? []).map((m) => m.sender_id)));
    const { data: profs } = senderIds.length
      ? await supabaseAdmin.from("profiles").select("id,display_name,username").in("id", senderIds)
      : { data: [] as Array<{ id: string; display_name: string; username: string }> };
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    return (msgs ?? []).map((m) => ({ ...m, sender: map.get(m.sender_id) ?? null }));
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("id,username,display_name,is_online,last_seen_at,created_at").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("feedback").select("id,user_id,body,created_at").order("created_at", { ascending: false }).limit(200);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,display_name,username").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string; username: string }> };
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({ ...r, sender: map.get(r.user_id) ?? null }));
  });
