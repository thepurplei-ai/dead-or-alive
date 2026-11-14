// Public configuration only. Paid AI keys and the Supabase service-role key are
// NEVER in the app: they are stored as Supabase secrets and used by Edge Functions.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudEnabled = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

export const TERMS_VERSION = '2026-11-14';
export const PRIVACY_VERSION = '2026-11-14';
export const AI_NOTICE_VERSION = '2026-11-14';
