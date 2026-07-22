import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "ht110111@icloud.com";
const INTERNAL_EMAIL_DOMAIN = "users.tsunagari.local";
const usernameSchema = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/);
const passwordSchema = z.string().min(6).max(128);

function internalEmailFor(username: string) {
  return `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export const registerWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        username: usernameSchema,
        password: passwordSchema,
        displayName: z.string().trim().min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("login_aliases")
      .select("user_id")
      .ilike("username", data.username)
      .maybeSingle();
    if (existing) throw new Error("このユーザーIDは使用されています");

    const email = internalEmailFor(data.username);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, display_name: data.displayName },
    });
    if (createErr || !created.user) {
      throw new Error("アカウントを作成できませんでした");
    }
    const userId = created.user.id;

    const { error: aliasError } = await supabaseAdmin.from("login_aliases").upsert({
      user_id: userId,
      username: data.username,
      email,
    });
    if (aliasError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("登録を完了できませんでした");
    }

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      username: data.username,
      display_name: data.displayName,
    });
    await supabaseAdmin.from("user_settings").upsert({ user_id: userId });
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "user" });

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("認証サービスに接続できません");
    const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessionData, error: signErr } = await authClient.auth.signInWithPassword({ email, password: data.password });
    if (signErr || !sessionData.session) throw new Error("ログインに失敗しました");
    return {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    };
  });

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ username: usernameSchema, password: passwordSchema }).parse(input))
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

    if (alias.email.toLowerCase() === ADMIN_EMAIL) {
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
