// Public config. Safe to commit: the Supabase anon key is meant to be public (RLS protects the data).
// NEVER put the service_role key, webhook secret or any API secret in this file.
window.APP_CONFIG = {
  SUPABASE_URL: '',        // e.g. https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: '',   // Supabase > Project Settings > API > anon public key
  CHECKOUT_URL: '',        // Lemon Squeezy / Dodo checkout link
  FREE_DAILY_LIMIT: 0      // 0 = unlimited. Set to 3 only after payments work, otherwise free users get stuck
};
