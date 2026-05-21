import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rwdskgwzibdnqzfilizb.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_XZY53Gm5WPCF5XRLtBRUeA_OBVwTt9i";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
