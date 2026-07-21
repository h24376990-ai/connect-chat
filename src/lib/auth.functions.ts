import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "ht110111@icloud.com";
const usernameSchema = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/);

export const completeRegistration = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userError || !userData.user?.email) throw new Error("登録情報を確認できませんでした");

    const username = usernameSchema.parse(userData.user.user_metadata?.username);
    const displayName = z.string().trim().min(1).max(50).parse(userData.user.user_metadata?.display_name);
    const email = userData.user.email.toLowerCase();

    const { error: aliasError } = await supabaseAdmin.from("login_aliases").upsert({
      user_id: data.userId,
      username,
      email,
    });
    if (aliasError) throw new Error(aliasError.code === "23505" ? "このユーザーIDは使用されています" : "登録を完了できませんでした");

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: data.userId,
      username,
      display_name: displayName,
    });
    if (profileError) throw new Error("プロフィールを作成できませんでした");
    await supabaseAdmin.from("user_settings").upsert({ user_id: data.userId });
    await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: "user" });
    return { ok: true };
  });

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ username: usernameSchema, password: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: alias } = await supabaseAdmin
      .from("login_aliases")
      .select("user_id,email")
      .ilike("username", data.username)
      .maybeSingle();
    if (!alias) throw new Error("ユーザーIDまたはパスワードが正しくありません");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("認証サービスに接続できません");
    const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessionData, error } = await authClient.auth.signInWithPassword({ email: alias.email, password: data.password });
    if (error || !sessionData.session) throw new Error("ユーザーIDまたはパスワードが正しくありません");

    if (alias.email.toLowerCase() === ADMIN_EMAIL && sessionData.user.email_confirmed_at) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: alias.user_id, role: "admin" });
    }
    return {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("退会処理を完了できませんでした");
    return { ok: true };
  });