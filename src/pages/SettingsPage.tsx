import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { exportBackup, importBackup } from '../lib/backup';
import { CURRENCIES } from '../lib/format';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

export function SettingsPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem('wayfare.currency') || 'USD';
    } catch {
      return 'USD';
    }
  });
  const usage = useLiveQuery(async () => {
    const media = await db.media.toArray();
    return { trips: await db.trips.count(), media: media.length, bytes: media.reduce((s, m) => s + m.blob.size + m.thumb.size, 0) };
  });
  const [quota, setQuota] = useState<string>();
  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota) setQuota(`${(est.quota / 1e9).toFixed(1)} GB available to Wayfare on this device.`);
      await navigator.storage?.persist?.();
    })().catch(() => {});
  }, []);

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="display">Preferences & data</h1>
        </div>
      </header>

      <div className="panel">
        <h2 className="h3">Default currency</h2>
        <p className="muted small">Used for new trips. Each trip can set its own.</p>
        <select
          className="input"
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            try {
              localStorage.setItem('wayfare.currency', e.target.value);
            } catch {
              /* ignore */
            }
          }}
        >
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="panel">
        <h2 className="h3">Your data</h2>
        <p className="muted small">
          Everything is stored privately on this device. {usage && `${usage.trips} trips · ${usage.media} photos & videos · ${(usage.bytes / 1e6).toFixed(1)} MB.`} {quota}
        </p>
        <p className="muted small">Use a backup file to move your journeys between your phone, iPad and laptop.</p>
        <div className="row">
          <button
            className="btn btn--ghost"
            disabled={!!busy}
            onClick={async () => {
              setBusy('Packing backup…');
              try {
                await exportBackup();
              } finally {
                setBusy('');
              }
            }}
          >
            <Icon name="download" size={18} /> Export backup
          </button>
          <button className="btn btn--ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Restore from backup
          </button>
          {busy && <span className="muted small">{busy}</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".wayfare,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy('Restoring…');
            try {
              const n = await importBackup(f);
              toast(`Restored ${n} trip${n === 1 ? '' : 's'}`);
            } catch (err) {
              toast(`Couldn't read that backup: ${(err as Error).message}`);
            } finally {
              setBusy('');
            }
          }}
        />
      </div>

      <div className="panel">
        <h2 className="h3">Install the app</h2>
        <p className="muted small">
          On iPhone or iPad: open in Safari → Share → <em>Add to Home Screen</em>. On Android or desktop Chrome/Edge: use <em>Install app</em> in the browser menu. Wayfare then works full-screen and offline.
        </p>
      </div>
    </div>
  );
}
