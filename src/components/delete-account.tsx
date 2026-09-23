import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export function DeleteAccountButton() {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (word.trim() !== "消す") { setError("「消す」と入力してください"); return; }
    setBusy(true); setError("");
    try {
      await deleteMyAccount();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "削除に失敗しました");
      setBusy(false);
    }
  }

  if (step === 0) {
    return <button type="button" className="settings-row" style={{ color: "#D93025" }} onClick={() => setStep(1)}>
      <Trash2 />アカウントを削除
    </button>;
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid #F3C2BE", borderRadius: 14, padding: 12 }}>
    <p style={{ color: "#D93025", fontWeight: 700, margin: 0 }}>アカウントを削除しますか？</p>
    <p style={{ fontSize: 13, margin: 0, opacity: 0.8 }}>投稿・チャット・フレンドなどすべてのデータが消えます。削除したユーザーIDは2日間ふたたび登録できません。</p>
    {step === 1
      ? <button type="button" className="pill-primary" style={{ background: "#D93025" }} onClick={() => setStep(2)}>本当に削除する（確認2回目へ）</button>
      : <>
          <label>確認のため「消す」と入力してください
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="消す" />
          </label>
          <button type="button" className="pill-primary" style={{ background: "#D93025" }} disabled={busy} onClick={run}>アカウントを削除する</button>
        </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="button" className="secondary-action" onClick={() => { setStep(0); setWord(""); setError(""); }}>やめる</button>
  </div>;
}
