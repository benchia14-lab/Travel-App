// PYT account creation: first name + last name + 4-digit PIN.
//
// Supabase Auth needs an email + password, and its public sign-up endpoint rejects
// made-up addresses and would try to send a confirmation email. This function
// creates the account with admin rights instead (already confirmed, no email sent).
// Signing in afterwards uses the normal Supabase Auth password sign-in.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SIGN_IN_DOMAIN = 'users.pyt.invalid';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Must match nameKey() in src/lib/account.ts */
function nameKey(first: string, last: string) {
  const part = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  return `${part(first)}.${part(last)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { first_name?: unknown; last_name?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  const first = String(body.first_name ?? '').trim().slice(0, 60);
  const last = String(body.last_name ?? '').trim().slice(0, 60);
  const pin = String(body.pin ?? '');
  const key = nameKey(first, last);
  const [a, b] = key.split('.');
  if (!a || !b) return json(400, { error: 'Enter your first and last name.' });
  if (!/^\d{4}$/.test(pin)) return json(400, { error: 'Your PIN must be 4 digits.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.createUser({
    email: `${key}@${SIGN_IN_DOMAIN}`,
    password: `wf:${key}:${pin}`,
    email_confirm: true,
    user_metadata: { first_name: first, last_name: last },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      return json(409, { error: 'An account with that name already exists. Sign in instead.' });
    }
    return json(400, { error: error.message });
  }
  return json(200, { ok: true });
});
