import { useEffect, useRef, useState, type ReactNode } from 'react';
import { signIn, signUp, useAccount, useAccountBootstrap } from '../lib/account';
import { startSync } from '../lib/sync';
import { supabaseConfigured } from '../lib/supabase';
import { Logo } from './Layout';
import { useToast } from './Toast';

/** Shows the sign-in / create-account screen until there's a signed-in profile, then starts sync. */
export function AuthGate({ children }: { children: ReactNode }) {
  useAccountBootstrap();
  const { ready, session, profile, error } = useAccount();
  const toast = useToast();
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) setSyncedFor(null); // signed out: sync again on the next sign-in
  }, [uid]);

  useEffect(() => {
    if (!uid || !profile || syncedFor === uid) return;
    setSyncedFor(uid);
    startSync(uid)
      .then((adopted) => adopted && toast(`Uploaded ${adopted} trip${adopted === 1 ? '' : 's'} from this device to your account`))
      .catch(() => {});
  }, [uid, profile, syncedFor, toast]);

  if (!supabaseConfigured) return <>{children}</>; // local-only build (no Supabase settings)
  if (!ready) return <div className="auth"><div className="spinner" /></div>;
  if (!session || !profile) return <AuthScreen restoreError={session ? error : undefined} />;
  return <>{children}</>;
}

function AuthScreen({ restoreError }: { restoreError?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(restoreError ?? '');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => firstRef.current?.focus(), [mode]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErr('');
    if (mode === 'signup' && pin !== pin2) return setErr('The two PINs don’t match.');
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(first, last, pin);
      else await signIn(first, last, pin);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <Logo size={56} />
        <h1 className="display">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {mode === 'signin'
            ? 'Sign in with your name and PIN to see your trips on any device.'
            : 'Just your name and a 4-digit PIN. Your trips sync to every device you sign in on.'}
        </p>
        <div className="grid2">
          <label className="field">
            <span className="field__label">First name</span>
            <input ref={firstRef} className="input" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field__label">Last name</span>
            <input className="input" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} required />
          </label>
        </div>
        <div className={mode === 'signup' ? 'grid2' : ''}>
          <label className="field">
            <span className="field__label">{mode === 'signup' ? 'Choose a PIN' : 'PIN'}</span>
            <input
              className="input input--pin"
              type="password"
              inputMode="numeric"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
              required
            />
          </label>
          {mode === 'signup' && (
            <label className="field">
              <span className="field__label">Confirm PIN</span>
              <input
                className="input input--pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="\d{4}"
                maxLength={4}
                placeholder="••••"
                value={pin2}
                onChange={(e) => setPin2(digits(e.target.value))}
                required
              />
            </label>
          )}
        </div>
        {err && <p className="auth__err" role="alert">{err}</p>}
        <button className="btn btn--primary btn--lg btn--block" disabled={busy || !first.trim() || !last.trim() || pin.length !== 4}>
          {busy ? <span className="spinner" /> : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p className="auth__switch">
          {mode === 'signin' ? 'New to PYT?' : 'Already have an account?'}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setErr('');
              setPin('');
              setPin2('');
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        {mode === 'signin' && <p className="muted small">Forgot your PIN? Ask the admin to reset it.</p>}
      </form>
    </div>
  );
}
