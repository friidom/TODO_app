import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Thrown at module load, so a missing variable fails the app at startup with a
// named cause instead of surfacing as an opaque error on the first query.
if (!supabaseUrl) {
  throw new Error(
    "Missing environment variable VITE_SUPABASE_URL — add it to .env and restart the dev server.",
  );
}

if (!supabaseKey) {
  throw new Error(
    "Missing environment variable VITE_SUPABASE_PUBLISHABLE_KEY — add it to .env and restart the dev server.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
