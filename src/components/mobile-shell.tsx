import { ReactNode } from "react";
import { Bell, Home, MessageCircle, Search, UserRound } from "lucide-react";

type Tab = "home" | "search" | "chat" | "notifications" | "profile";
export function MobileShell({ children, active, onChange, unread = 0 }: { children: ReactNode; active: Tab; onChange: (tab: Tab) => void; unread?: number }) {
  const items: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: "home", label: "ホーム", icon: Home }, { id: "search", label: "フレンド", icon: Search },
    { id: "chat", label: "チャット", icon: MessageCircle }, { id: "notifications", label: "通知", icon: Bell },
    { id: "profile", label: "マイページ", icon: UserRound },
  ];
  return <div className="app-frame"><div className="app-content">{children}</div><nav className="bottom-nav" aria-label="メインナビゲーション">{items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}><span className="nav-icon"><Icon size={22} strokeWidth={active === id ? 2.5 : 2} />{id === "notifications" && unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}</span><span>{label}</span></button>)}</nav></div>;
}