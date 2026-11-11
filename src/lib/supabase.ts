import { createClient } from '@supabase/supabase-js';

/**
 * Supabase connection. The URL and publishable key are designed to be public:
 * access to data is enforced by row-level security on the server.
 * Override them with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
 */
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://iruwakptkwyrlivjbpaw.supabase.co';
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_ZRRmSNdsFSHNBhy1wabqXw_WYSbcwaB';

export const supabaseConfigured = Boolean(URL && KEY);

export const supabase = createClient(URL || 'http://localhost', KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wayfare.auth' },
});

export const SUPABASE_URL = URL;
export const SUPABASE_KEY = KEY;

export const MEDIA_BUCKET = 'wayfare-media';
