import { FormEvent, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
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
    <main className="auth-page">
      <section className="auth-brand" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">いつもの毎日に、新しいつながりを。</p>
        <h1 id="auth-title">つながり<br />チャット</h1>
        <p className="brand-copy">気の合う友達やコミュニティと、安心して話せる場所。</p>
      </section>
      <section className="auth-panel">
        <div className="auth-tabs" role="tablist">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>ログイン</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>新規登録</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && <label>お名前<input name="displayName" required maxLength={50} placeholder="例：はる" /></label>}
          <label>ユーザーID<div className="field-with-icon"><UserRound size={18} /><input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoCapitalize="none" placeholder="半角英数字・_" /></div></label>
          {mode === "signup" && <label>メールアドレス<input name="email" type="email" required maxLength={254} placeholder="確認・パスワード再設定用" /></label>}
          <label>パスワード<div className="field-with-icon"><LockKeyhole size={18} /><input name="password" type={showPassword ? "text" : "password"} required minLength={8} maxLength={128} /><button type="button" className="icon-button" onClick={() => setShowPassword((v) => !v)} aria-label="パスワード表示を切り替え">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="primary-action" disabled={loading}>{loading ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}<ArrowRight size={18} /></button>
        </form>
        <p className="auth-footnote">登録により利用規約とプライバシーポリシーに同意したものとみなされます。</p>
      </section>
    </main>
  );
}