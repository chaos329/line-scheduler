import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// 旧: SUPABASE_SERVICE_ROLE_KEY / 新: SUPABASE_SECRET_KEYS({"default":"sb_secret_..."})
function serverKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secrets = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secrets) return JSON.parse(secrets)["default"];
  throw new Error("Supabase server key is not available in this environment");
}

export const db = createClient(Deno.env.get("SUPABASE_URL")!, serverKey());
