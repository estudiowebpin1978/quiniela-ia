import { createClient } from "@supabase/supabase-js";

export type Sorteo = "Previa" | "Primera" | "Matutina" | "Vespertina" | "Nocturna" | "Todos";

export interface Draw {
  id: number;
  draw_date: string;
  sorteo: Sorteo;
  pos_1: number; pos_2?: number; pos_3?: number; pos_4?: number; pos_5?: number;
  pos_6?: number; pos_7?: number; pos_8?: number; pos_9?: number; pos_10?: number;
  pos_11?: number; pos_12?: number; pos_13?: number; pos_14?: number; pos_15?: number;
  pos_16?: number; pos_17?: number; pos_18?: number; pos_19?: number; pos_20?: number;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: "free" | "premium" | "admin";
  premium_until: string | null;
}

// Browser client (anon key)
export function getSupabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server-only admin client (service_role)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const sb = getSupabaseBrowser();
  const { data } = await sb.from("user_profiles").select("id,email,role,premium_until").eq("id", userId).single();
  return data ?? null;
}

export function isPremiumActive(profile: UserProfile | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (profile.role !== "premium") return false;
  if (!profile.premium_until) return false;
  return new Date(profile.premium_until) > new Date();
}
