import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

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
  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} shouldScaleBackground={false}>
    <DrawerContent className="profile-bottom-sheet h-[85dvh] max-h-[92dvh] mt-0" aria-describedby="profile-sheet-description">
      <div className="flex shrink-0 items-center justify-between px-5 py-2">
        <span className="text-sm font-bold text-muted-foreground">プロフィール</span>
        <DrawerClose asChild>
          <Button variant="ghost" size="icon" aria-label="閉じる" title="閉じる"><X /></Button>
        </DrawerClose>
      </div>
      <div className="profile-sheet-scroll">
        <div className="profile-sheet-cover">
          {profile.background_url && <img src={profile.background_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="profile-sheet-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}</div>
          <DrawerTitle className="max-w-full break-words text-2xl leading-normal tracking-normal">{profile.display_name}</DrawerTitle>
          <DrawerDescription id="profile-sheet-description" className="max-w-full break-all">@{profile.username}</DrawerDescription>
          <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            {profile.age != null && <span className="rounded-md bg-muted px-3 py-1">{profile.age}歳</span>}
            {profile.gender && <span className="rounded-md bg-muted px-3 py-1">{GENDER[profile.gender] ?? profile.gender}</span>}
          </div>
          {profile.bio && <p className="w-full whitespace-pre-wrap break-words text-sm leading-7">{profile.bio}</p>}
          {profile.hobby_tags && profile.hobby_tags.length > 0 && <div className="flex max-w-full flex-wrap justify-center gap-2">{profile.hobby_tags.map((t) => <span className="max-w-full break-words rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground" key={t}>#{t}</span>)}</div>}
        </div>
      </div>
    </DrawerContent>
  </Drawer>;
}
