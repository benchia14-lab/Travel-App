import { useEffect, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, supabase, supabaseConfigured } from './supabase';

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  name_key: string;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string;
}

/** "Ben", "Chia" → "ben.chia" (accents removed, letters and digits only). */
export function nameKey(first: string, last: string) {
  const part = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  return `${part(first)}.${part(last)}`;
}

/** Accounts are name + PIN. Behind the scenes Supabase Auth needs an email and a 6+ character password. */
/** Must match the pyt-signup Edge Function. */
const SIGN_IN_DOMAIN = 'users.pyt.invalid';
export const signInEmail = (first: string, last: string) => `${nameKey(first, last)}@${SIGN_IN_DOMAIN}`;
export const pinPassword = (key: string, pin: string) => `wf:${key}:${pin}`;

export const validPin = (pin: string) => /^\d{4}$/.test(pin);

// ── Session store ────────────────────────────────────────────────────────────
interface AccountState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  error?: string;
}
let state: AccountState = { ready: !supabaseConfigured, session: null, profile: null };
const listeners = new Set<() => void>();
const emit = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useAccount() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
export const currentUserId = () => state.session?.user.id;
export const isAdmin = () => !!state.profile?.is_admin;

async function loadProfile(first?: string, last?: string): Promise<Profile | null> {
  // wf_register creates the profile on first sign-in and refreshes "last seen" afterwards.
  const meta = state.session?.user.user_metadata as { first_name?: string; last_name?: string } | undefined;
  const { data, error } = await supabase.rpc('wf_register', {
    p_first_name: first ?? meta?.first_name ?? '',
    p_last_name: last ?? meta?.last_name ?? '',
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}

let started = false;
/** Restore the saved session (if any) and keep the store in step with Supabase Auth. */
export function useAccountBootstrap() {
  useEffect(() => {
    if (started || !supabaseConfigured) return;
    started = true;
    supabase.auth.getSession().then(async ({ data }) => {
      emit({ session: data.session });
      if (data.session) {
        try {
          emit({ profile: await loadProfile() });
        } catch (e) {
          emit({ error: (e as Error).message });
        }
      }
      emit({ ready: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      emit({ session });
      if (!session) emit({ profile: null });
    });
  }, []);
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'That name and PIN don’t match an account.';
  if (/already registered|already exists/i.test(msg)) return 'An account with that name already exists. Sign in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
  return msg;
}

export async function signUp(first: string, last: string, pin: string) {
  first = first.trim();
  last = last.trim();
  const key = nameKey(first, last);
  if (!first || !last || key.length < 3) throw new Error('Enter your first and last name.');
  if (!validPin(pin)) throw new Error('Your PIN must be 4 digits.');
  // The account is created server-side (see supabase/functions/pyt-signup), then we sign in normally.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pyt-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ first_name: first, last_name: last, pin }),
  }).catch(() => null);
  if (!res) throw new Error('Can’t reach the server. Check your connection and try again.');
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(friendly(body.error ?? 'Couldn’t create the account.'));
  await signIn(first, last, pin);
}

export async function signIn(first: string, last: string, pin: string) {
  const key = nameKey(first, last);
  if (!validPin(pin)) throw new Error('Your PIN must be 4 digits.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: signInEmail(first, last), password: pinPassword(key, pin) });
  if (error) throw new Error(friendly(error.message));
  emit({ session: data.session });
  emit({ profile: await loadProfile(first, last) });
}

export async function signOut() {
  await supabase.auth.signOut();
  emit({ session: null, profile: null });
}

/** Admin: give a user a new PIN. */
export async function adminResetPin(user: Profile, pin: string) {
  if (!validPin(pin)) throw new Error('PIN must be 4 digits.');
  const { error } = await supabase.rpc('wf_admin_reset_pin', { p_user: user.id, p_password: pinPassword(user.name_key, pin) });
  if (error) throw new Error(error.message);
}
