import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Number of days a deleted user ID stays blocked from re-registration. */
const BLOCK_DAYS = 2;

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("username").eq("id", userId).maybeSingle();

    if (profile?.username) {
      const blockedUntil = new Date(Date.now() + BLOCK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from("deleted_usernames").upsert({
        username: profile.username.toLowerCase(),
        blocked_until: blockedUntil,
      });
    }

    await supabaseAdmin.from("messages").delete().eq("sender_id", userId);
    await supabaseAdmin.from("message_reactions").delete().eq("user_id", userId);
    await supabaseAdmin.from("post_comments").delete().eq("author_id", userId);
    await supabaseAdmin.from("post_likes").delete().eq("user_id", userId);
    await supabaseAdmin.from("posts").delete().eq("author_id", userId);
    await supabaseAdmin.from("friend_recruitments").delete().eq("author_id", userId);
    await supabaseAdmin.from("friendships").delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    await supabaseAdmin.from("community_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("conversation_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("notifications").delete().or(`user_id.eq.${userId},actor_id.eq.${userId}`);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_settings").delete().eq("user_id", userId);
    await supabaseAdmin.from("login_aliases").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("アカウントを削除できませんでした");

    return { ok: true };
  });
