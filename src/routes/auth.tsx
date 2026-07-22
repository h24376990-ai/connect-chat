import { FormEvent, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Eye, EyeOff, Lock, MessageCircle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerWithUsername, signInWithUsername } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "ログイン | つながりチャット" }, { name: "description", content: "つながりチャットへユーザーIDでログイン、新規登録できます。" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const loginFn = useServerFn(signInWithUsername);
  const registerFn = useServerFn(registerWithUsername);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const result = mode === "login"
        ? await loginFn({ data: { username, password } })
        : await registerFn({ data: { username, password, displayName: String(form.get("displayName") ?? "").trim() } });
      const { error: sessionError } = await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
      if (sessionError) throw sessionError;
      navigate({ to: "/home", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "処理に失敗しました");
    } finally { setLoading(false); }
  }

  return (
    <main className="auth-screen">
      <div className="auth-hero">
        <div className="auth-logo" aria-hidden="true"><MessageCircle strokeWidth={2.5} /></div>
        <h1 className="auth-title">つながり</h1>
        <p className="auth-sub">SNS + チャットアプリ</p>
      </div>
      <section className="auth-card">
        <div className="auth-pill" role="tablist">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>ログイン</button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>新規登録</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <div className="pill-field"><User size={18} /><input name="displayName" required maxLength={50} placeholder="お名前（表示名）" /></div>
          )}
          <div className="pill-field"><AtSign size={18} /><input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoCapitalize="none" placeholder="ユーザーID（半角英数字）" /></div>
          <div className="pill-field"><Lock size={18} /><input name="password" type={showPassword ? "text" : "password"} required minLength={6} maxLength={128} placeholder="パスワード（6文字以上）" /><button type="button" className="pill-eye" onClick={() => setShowPassword((v) => !v)} aria-label="パスワード表示切替">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="pill-primary" disabled={loading}>{loading ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}</button>
        </form>
      </section>
      <p className="auth-legal">登録すると利用規約とプライバシーポリシーに同意したことになります</p>
    </main>
  );
}
