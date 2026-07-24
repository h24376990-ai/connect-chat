import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  hobby_tags: string[];
  theme_color: string;
  age: number | null;
  gender: string | null;
};

const THEME_COLORS = ["cyan", "green", "purple", "pink", "orange", "blue", "teal", "magenta"];

export const Route = createFileRoute("/_authenticated/profile/edit")({ component: ProfileEditPage });

function ProfileEditPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tags, setTags] = useState<string>("");
  const [theme, setTheme] = useState<string>("cyan");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,username,avatar_url,bio,hobby_tags,theme_color,age,gender").eq("id", user.id).single();
      if (data) {
        setProfile(data as Profile);
        setTags((data.hobby_tags ?? []).join(", "));
        setTheme(data.theme_color ?? "cyan");
      }
    })();
  }, [user.id]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("保存中…");
    const f = new FormData(e.currentTarget);
    const hobby_tags = tags.split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const ageStr = String(f.get("age") ?? "").trim();
    const { error } = await supabase.from("profiles").update({
      display_name: String(f.get("display_name") ?? "").trim(),
      bio: String(f.get("bio") ?? "").trim() || null,
      gender: String(f.get("gender") ?? "") || null,
      age: ageStr ? Number(ageStr) : null,
      hobby_tags,
      theme_color: theme,
    }).eq("id", user.id);
    if (error) { setStatus(error.message); return; }
    setStatus("保存しました");
    setTimeout(() => navigate({ to: "/home" }), 600);
  }

  return <MobileShell active="profile" onChange={() => navigate({ to: "/home" })} unread={0}>
    <header className="home-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello">プロフィール編集</h1>
      <div />
    </header>
    <main className="simple-view">
      {!profile ? <div className="empty-panel"><p>読み込み中…</p></div> :
        <form onSubmit={onSubmit} className="modal-sheet" style={{ position: "static", boxShadow: "none" }}>
          <label>表示名<input name="display_name" defaultValue={profile.display_name} required maxLength={40} /></label>
          <label>ユーザーID<input value={profile.username} disabled /></label>
          <label>ひとこと<textarea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} /></label>
          <label>年齢
            <select name="age" defaultValue={profile.age ?? ""}>
              <option value="">未設定</option>
              {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}歳</option>)}
            </select>
          </label>
          <label>性別
            <select name="gender" defaultValue={profile.gender ?? ""}>
              <option value="">未設定</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </label>
          <label>趣味タグ（カンマ区切り）<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ゲーム, 音楽, 映画" /></label>
          <label>テーマカラー
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {THEME_COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setTheme(c)}
                  className={`tile-icon tile-icon-${c}`}
                  style={{ width: 44, height: 44, borderRadius: 12, border: theme === c ? "3px solid var(--color-primary)" : "3px solid transparent", cursor: "pointer" }}
                  aria-label={c} />
              ))}
            </div>
          </label>
          <button className="pill-primary" type="submit">保存する</button>
          {status && <p className="form-notice">{status}</p>}
          <button type="button" className="secondary-action" onClick={() => navigate({ to: "/home" })}>キャンセル</button>
        </form>
      }
    </main>
  </MobileShell>;
}
