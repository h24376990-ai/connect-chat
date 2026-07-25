import { supabase } from "@/integrations/supabase/client";

const YEAR = 60 * 60 * 24 * 365;

export async function uploadUserMedia(userId: string, folder: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("user-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage.from("user-media").createSignedUrl(path, YEAR);
  if (sErr || !data) throw sErr ?? new Error("signed url failed");
  return data.signedUrl;
}
