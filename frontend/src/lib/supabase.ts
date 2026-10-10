import { createClient } from "@supabase/supabase-js";

// These VITE_ values are public client identifiers, never service-role secrets.
const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "lux-player-3-auth",
      },
    })
  : null;
