import { X } from "lucide-react";

type Props = {
  profile: {
    display_name: string; username: string; avatar_url: string | null;
    background_url?: string | null; bio: string | null; age: number | null; gender: string | null;
    hobby_tags?: string[];
  };
  onClose: () => void;
};

const GENDER: Record<string, string> = { male: "男性", female: "女性", other: "その他" };

export function ProfileDetailModal({ profile, onClose }: Props) {
  const initial = profile.display_name?.slice(0, 1) ?? "?";
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-sheet" onMouseDown={(e) => e.stopPropagation()} style={{ paddingTop: 0, overflow: "hidden" }}>
      <button className="round-btn" aria-label="閉じる" onClick={onClose} style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}><X size={16} /></button>
      <div style={{ height: 110, margin: "-16px -16px 0", background: profile.background_url ? `center/cover url(${profile.background_url})` : "linear-gradient(135deg,#B7E7E0,#DDF3EE)" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: -48, gap: 8 }}>
        <div className="large-avatar" style={{ border: "4px solid #fff" }}>{profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initial}</div>
        <h2 style={{ margin: 0 }}>{profile.display_name}</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>@{profile.username}</p>
        <div className="tag-row">
          {profile.age != null && <span>{profile.age}歳</span>}
          {profile.gender && <span>{GENDER[profile.gender] ?? profile.gender}</span>}
        </div>
        {profile.bio && <p style={{ textAlign: "center", padding: "0 8px" }}>{profile.bio}</p>}
        {profile.hobby_tags && profile.hobby_tags.length > 0 && <div className="tag-row">{profile.hobby_tags.map((t) => <span key={t}>#{t}</span>)}</div>}
      </div>
    </section>
  </div>;
}
