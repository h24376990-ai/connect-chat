import { FormEvent, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Eye, EyeOff, Lock, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeRegistration, signInWithUsername } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "ログイン | つながりチャット" }, { name: "description", content: "つながりチャットへユーザーIDでログイン、新規登録できます。" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const loginFn = useServerFn(signInWithUsername);
  const completeFn = useServerFn(completeRegistration);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "login") {
        const result = await loginFn({ data: { username, password } });
        const { error: sessionError } = await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
        if (sessionError) throw sessionError;
        navigate({ to: "/home", replace: true });
      } else {
        const email = String(form.get("email") ?? "").trim();
        const displayName = String(form.get("displayName") ?? "").trim();
        const { data, error: signupError } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { username, display_name: displayName } },
        });
        if (signupError) throw signupError;
        if (!data.user) throw new Error("登録を開始できませんでした");
        await completeFn({ data: { userId: data.user.id } });
        setNotice("確認メールを送信しました。確認後、ユーザーIDでログインしてください。");
        setMode("login");
      }
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
            <div className="pill-field"><AtSign size={18} /><input name="displayName" required maxLength={50} placeholder="お名前（表示名）" /></div>
          )}
          <div className="pill-field"><AtSign size={18} /><input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoCapitalize="none" placeholder="ユーザーID" /></div>
          {mode === "signup" && (
            <div className="pill-field"><AtSign size={18} /><input name="email" type="email" required maxLength={254} placeholder="メールアドレス（復旧用）" /></div>
          )}
          <div className="pill-field"><Lock size={18} /><input name="password" type={showPassword ? "text" : "password"} required minLength={6} maxLength={128} placeholder="パスワード（6文字以上）" /><button type="button" className="pill-eye" onClick={() => setShowPassword((v) => !v)} aria-label="パスワード表示切替">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="pill-primary" disabled={loading}>{loading ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}</button>
        </form>
      </section>
      <p className="auth-legal">登録すると利用規約とプライバシーポリシーに同意したことになります</p>
    </main>
  );
}
