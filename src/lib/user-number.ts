import { supabase } from "@/integrations/supabase/client";

type ProfileOrder = { id: string; display_name: string; created_at: string };
let cached: Map<string, string> | null = null;

export async function loadUserNumbers(): Promise<Map<string, string>> {
  if (cached) return cached;
  const { data } = await supabase.from("profiles").select("id,display_name,created_at").order("created_at", { ascending: true }).order("id", { ascending: true });
  const profiles = (data ?? []) as ProfileOrder[];
  const mokage = profiles.find((profile) => profile.display_name === "もかげ");
  const ordered = [mokage, ...profiles.filter((profile) => profile.id !== mokage?.id)].filter(Boolean) as ProfileOrder[];
  cached = new Map(ordered.map((profile, index) => [profile.id, String(index + 1).padStart(5, "0")]));
  return cached;
}

export function formatUserNumber(numbers: Map<string, string>, userId: string): string {
  return numbers.get(userId) ?? "-----";
}

export function clearUserNumberCache() { cached = null; }
