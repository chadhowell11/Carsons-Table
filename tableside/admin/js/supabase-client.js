// The browser's Supabase client, configured from window.__BRAND__.supabase
// (url + anon key only; injected by routes/admin-pages.js). One per page.
const cfg = (window.__BRAND__ && window.__BRAND__.supabase) || null;
if (!cfg || !window.supabase) throw new Error('admin: brand head or supabase-js did not load');

export const supabase = window.supabase.createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
