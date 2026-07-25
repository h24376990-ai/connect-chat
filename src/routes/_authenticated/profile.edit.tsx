import { FormEvent, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, ChevronLeft, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { uploadUserMedia } from "@/lib/media";

type Profile = {
  id: string; display_name: string; username: string;
  avatar_url: string | null; background_url: string | null; bio: string | null;
  hobby_tags: string[]; theme_color: string; age: number | null; gender: string | null;
};

const THEME_COLORS = ["#25B7A5", "#7CC77A", "#B47CE0", "#F09EBB", "#F0A85C", "#5C9CF0", "#4FC3B5", "#E27ABE"];

export const Route = createFileRoute("/_authenticated/profile/edit")({ component: ProfileEditPage });

function ProfileEditPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tags, setTags] = useState<string>("");
  const [theme, setTheme] = useState<string>("#25B7A5");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState<"avatar" | "bg" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,username,avatar_url,background_url,bio,hobby_tags,theme_color,age,gender").eq("id", user.id).single();
      if (data) {
        setProfile(data as Profile);
        setTags((data.hobby_tags ?? []).join(", "));
        setTheme(data.theme_color ?? "#25B7A5");
        setAvatarUrl(data.avatar_url); setBgUrl(data.background_url);
      }
    })();
  }, [user.id]);

  async function handleFile(kind: "avatar" | "bg", file?: File | null) {
    if (!file) return;
    setUploading(kind); setStatus("画像アップロード中…");
    try {
      const url = await uploadUserMedia(user.id, kind === "avatar" ? "avatars" : "backgrounds", file);
      if (kind === "avatar") setAvatarUrl(url); else setBgUrl(url);
      setStatus("");
    } catch (e) { setStatus(e instanceof Error ? e.message : "アップロード失敗"); }
    finally { setUploading(null); }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setStatus("保存中…");
    const f = new FormData(e.currentTarget);
    const hobby_tags = tags.split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const ageStr = String(f.get("age") ?? "").trim();
    const { error } = await supabase.from("profiles").update({
      display_name: String(f.get("display_name") ?? "").trim(),
      bio: String(f.get("bio") ?? "").trim() || null,
      gender: String(f.get("gender") ?? "") || null,
      age: ageStr ? Number(ageStr) : null,
      hobby_tags, theme_color: theme, avatar_url: avatarUrl, background_url: bgUrl,
    }).eq("id", user.id);
    if (error) { setStatus(error.message); return; }
    setStatus("保存しました");
    setTimeout(() => navigate({ to: "/home" }), 600);
  }

  const initial = profile?.display_name?.slice(0, 1) ?? "?";

  return <MobileShell active="profile" onChange={() => navigate({ to: "/home" })} unread={0}>
    <header className="home-header">
      <button className="round-btn" aria-label="戻る" onClick={() => navigate({ to: "/home" })}><ChevronLeft size={18} /></button>
      <h1 className="home-hello">プロフィール編集</h1>
      <div />
    </header>
    <main className="simple-view">
      {!profile ? <div className="empty-panel"><p>読み込み中…</p></div> :
        <form onSubmit={onSubmit} className="modal-sheet" style={{ position: "static", boxShadow: "none" }}>
          <div className="profile-edit-hero" style={{ background: bgUrl ? `center/cover url(${bgUrl})` : "linear-gradient(135deg,#B7E7E0,#DDF3EE)" }}>
            <button type="button" className="hero-edit-btn" onClick={() => bgInput.current?.click()} disabled={uploading !== null}>
              <ImageIcon size={14} />ヘッダー変更
            </button>
            <div className="hero-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initial}</span>}
              <button type="button" className="hero-avatar-edit" onClick={() => avatarInput.current?.click()} disabled={uploading !== null} aria-label="アイコン変更"><Camera size={16} /></button>
            </div>
          </div>
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => handleFile("avatar", e.target.files?.[0])} />
          <input ref={bgInput} type="file" accept="image/*" hidden onChange={(e) => handleFile("bg", e.target.files?.[0])} />

          <label>表示名<input name="display_name" defaultValue={profile.display_name} required maxLength={40} /></label>
          <label>ユーザーID<input value={profile.username} disabled /></label>
          <label>ひとこと<textarea name="bio" defaultValue={profile.bio ?? ""} maxLength={160} /></label>
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
                  style={{ width: 44, height: 44, borderRadius: 12, background: c, border: theme === c ? "3px solid #0E4A48" : "3px solid transparent", cursor: "pointer" }}
                  aria-label={c} />
              ))}
            </div>
          </label>
          <button className="pill-primary" type="submit" disabled={uploading !== null}>保存する</button>
          {status && <p className="form-notice">{status}</p>}
          <button type="button" className="secondary-action" onClick={() => navigate({ to: "/home" })}>キャンセル</button>
        </form>
      }
    </main>
  </MobileShell>;
}
