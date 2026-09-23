import { FormEvent, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminSignIn } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/login")({ component: AdminLoginPage });

function AdminLoginPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setStatus("認証中…");
    const f = new FormData(e.currentTarget);
    try {
      const { accessToken, refreshToken } = await adminSignIn({ data: { email: String(f.get("email")), password: String(f.get("password")) } });
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (err) { setStatus(err instanceof Error ? err.message : "ログイン失敗"); }
    finally { setBusy(false); }
  }

  return <div className="auth-screen">
    <div className="auth-card">
      <div className="auth-brand"><span className="auth-brand-icon"><ShieldCheck /></span><h1>管理者ログイン</h1><p>管理者権限のあるユーザーIDとパスワードでログインしてください</p></div>
      <form onSubmit={onSubmit} method="post" className="auth-form">
        <label>ユーザーID<input name="email" type="text" required autoComplete="username" placeholder="mokou1101" /></label>
        <label>パスワード<input name="password" type="password" required minLength={6} maxLength={128} autoComplete="current-password" /></label>
        <button className="pill-primary" disabled={busy}>ログイン</button>
        {status && <p className="form-notice">{status}</p>}
        <p className="form-hint">初回ログイン時は入力したパスワードが自動的に設定されます。</p>
      </form>
    </div>
  </div>;
}
