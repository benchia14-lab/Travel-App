import Dexie, { type Table } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db } from '../db';
import type { Media } from '../types';
import { MEDIA_BUCKET, supabase } from './supabase';

/**
 * Local-first sync with Supabase.
 *
 * The app keeps reading and writing IndexedDB (fast, works offline). Every local
 * change is queued in an outbox; the queue is pushed to `wf_records` (and photos to
 * Storage), then anything newer on the server is pulled back down. Last write wins.
 */

type Kind = 'trip' | 'entry' | 'leg' | 'media';
type Op = 'upsert' | 'delete';
interface Row {
  user_id: string;
  kind: Kind;
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at?: string;
}

const tables = (): Record<Kind, Table<{ id: string }, string>> => ({
  trip: db.trips as unknown as Table<{ id: string }, string>,
  entry: db.entries as unknown as Table<{ id: string }, string>,
  leg: db.legs as unknown as Table<{ id: string }, string>,
  media: db.media as unknown as Table<{ id: string }, string>,
});
const KINDS: Kind[] = ['trip', 'leg', 'entry', 'media'];

// ── Status ───────────────────────────────────────────────────────────────────
export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSync?: number;
  pending: number;
  message?: string;
}
let status: SyncStatus = { state: 'off', pending: 0 };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch, pending: outbox.size };
  listeners.forEach((l) => l());
};
export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

// ── Outbox (persisted so offline edits survive a reload) ───────────────────
const OUTBOX_KEY = 'wayfare.outbox';
const OWNER_KEY = 'wayfare.owner';
const cursorKey = (uid: string) => `wayfare.cursor.${uid}`;
const uploadedKey = (uid: string) => `wayfare.uploaded.${uid}`;

const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const outbox = new Map<string, { op: Op; seq: number }>(
  (() => {
    try {
      return JSON.parse(ls.get(OUTBOX_KEY) ?? '[]');
    } catch {
      return [];
    }
  })(),
);
let seq = 0;
const saveOutbox = () => ls.set(OUTBOX_KEY, JSON.stringify([...outbox]));

let uploaded = new Set<string>();

function mark(kind: Kind, id: string, op: Op) {
  outbox.set(`${kind}:${id}`, { op, seq: ++seq });
  saveOutbox();
  setStatus({});
  schedule(1500);
}

// ── Change tracking ──────────────────────────────────────────────────────────
type RemoteTx = { wfRemote?: boolean };
const isRemote = () => !!(Dexie.currentTransaction as unknown as RemoteTx | null)?.wfRemote;

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  const t = tables();
  for (const kind of KINDS) {
    t[kind].hook('creating', (_pk, obj) => {
      if (!isRemote()) mark(kind, obj.id, 'upsert');
    });
    t[kind].hook('updating', (_mods, pk) => {
      if (!isRemote()) mark(kind, String(pk), 'upsert');
    });
    t[kind].hook('deleting', (pk) => {
      if (!isRemote()) mark(kind, String(pk), 'delete');
    });
  }
}

/** Run local writes that came from the server without queueing them to be pushed back. */
async function applyRemote(fn: () => Promise<void>) {
  await db.transaction('rw', [db.trips, db.entries, db.legs, db.media], async (tx) => {
    (tx as unknown as RemoteTx).wfRemote = true;
    await fn();
  });
}

// ── Push / pull ──────────────────────────────────────────────────────────────
const mediaPath = (uid: string, id: string, thumb = false) => `${uid}/${id}${thumb ? '_thumb' : ''}`;

async function push(uid: string) {
  if (!outbox.size) return;
  const batch = [...outbox].map(([key, v]) => ({ key, ...v }));
  const t = tables();
  const rows: Row[] = [];
  const done: { key: string; seq: number }[] = [];
  for (const item of batch) {
    const [kind, id] = item.key.split(/:(.+)/) as [Kind, string];
    if (item.op === 'delete') {
      rows.push({ user_id: uid, kind, id, data: {}, deleted: true });
      if (kind === 'media') await supabase.storage.from(MEDIA_BUCKET).remove([mediaPath(uid, id), mediaPath(uid, id, true)]);
    } else {
      const obj = (await t[kind].get(id)) as Record<string, unknown> | undefined;
      if (!obj) {
        done.push(item); // created and removed before it was ever pushed
        continue;
      }
      if (kind === 'media') {
        const m = obj as unknown as Media;
        if (!uploaded.has(id)) {
          const store = supabase.storage.from(MEDIA_BUCKET);
          const a = await store.upload(mediaPath(uid, id), m.blob, { upsert: true, contentType: m.blob.type || 'application/octet-stream' });
          if (a.error) throw new Error(`Photo upload failed: ${a.error.message}`);
          const b = await store.upload(mediaPath(uid, id, true), m.thumb, { upsert: true, contentType: 'image/jpeg' });
          if (b.error) throw new Error(`Photo upload failed: ${b.error.message}`);
          uploaded.add(id);
          ls.set(uploadedKey(uid), JSON.stringify([...uploaded]));
        }
        const { blob: _b, thumb: _t, ...meta } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
        rows.push({ user_id: uid, kind, id, data: meta as unknown as Record<string, unknown>, deleted: false });
      } else {
        rows.push({ user_id: uid, kind, id, data: obj, deleted: false });
      }
    }
    done.push(item);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('wf_records').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,kind,id' });
    if (error) throw new Error(error.message);
  }
  // Only clear items that weren't changed again while we were pushing.
  for (const d of done) if (outbox.get(d.key)?.seq === d.seq) outbox.delete(d.key);
  saveOutbox();
}

async function pull(uid: string) {
  const since = ls.get(cursorKey(uid));
  // Overlap a little so rows committed out of order aren't missed (applying twice is harmless).
  const from = since ? new Date(Date.parse(since) - 60_000).toISOString() : '1970-01-01T00:00:00Z';
  let cursor = since ?? from;
  let offset = 0;
  const t = tables();
  for (;;) {
    const { data, error } = await supabase
      .from('wf_records')
      .select('kind,id,data,deleted,updated_at')
      .eq('user_id', uid)
      .gt('updated_at', from)
      .order('updated_at', { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    // Skip anything with unsent local edits: the local version wins and is pushed next.
    const incoming = rows.filter((r) => !outbox.has(`${r.kind}:${r.id}`));

    // Download photos first (network calls can't run inside a database transaction).
    const files = new Map<string, { blob: Blob; thumb: Blob }>();
    for (const r of incoming) {
      if (r.kind !== 'media' || r.deleted) continue;
      if (await db.media.get(r.id)) continue; // photo bytes never change
      const store = supabase.storage.from(MEDIA_BUCKET);
      const [full, thumb] = await Promise.all([store.download(mediaPath(uid, r.id)), store.download(mediaPath(uid, r.id, true))]);
      if (full.data && thumb.data) files.set(r.id, { blob: full.data, thumb: thumb.data });
    }

    await applyRemote(async () => {
      for (const r of incoming) {
        if (r.deleted) {
          await t[r.kind].delete(r.id);
          continue;
        }
        if (r.kind === 'media') {
          const f = files.get(r.id);
          if (f) await db.media.put({ ...(r.data as unknown as Media), ...f });
          else {
            const existing = await db.media.get(r.id);
            if (existing) await db.media.put({ ...(r.data as unknown as Media), blob: existing.blob, thumb: existing.thumb });
          }
        } else {
          await t[r.kind].put(r.data as { id: string });
        }
      }
    });
    for (const r of rows) {
      if (r.kind === 'media') uploaded.add(r.id);
      if (r.updated_at && r.updated_at > cursor) cursor = r.updated_at;
    }
    if (rows.length < 500) break;
    offset += 500;
  }
  ls.set(uploadedKey(uid), JSON.stringify([...uploaded]));
  ls.set(cursorKey(uid), cursor);
}

// ── Engine ───────────────────────────────────────────────────────────────────
let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | null = null;

function schedule(ms: number) {
  if (!userId) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

export async function syncNow(): Promise<void> {
  const uid = userId;
  if (!uid) return;
  if (running) return running;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline' });
    return;
  }
  setStatus({ state: 'syncing', message: undefined });
  running = (async () => {
    try {
      await push(uid);
      await pull(uid);
      setStatus({ state: 'idle', lastSync: Date.now() });
    } catch (e) {
      const msg = (e as Error).message;
      setStatus({ state: /fetch|network/i.test(msg) ? 'offline' : 'error', message: msg });
    } finally {
      running = null;
      if (outbox.size && userId) schedule(5000);
    }
  })();
  return running;
}

async function wipeLocal() {
  await applyRemote(async () => {
    await Promise.all([db.trips.clear(), db.entries.clear(), db.legs.clear(), db.media.clear()]);
  });
  outbox.clear();
  saveOutbox();
}

const onWake = () => {
  if (document.visibilityState === 'visible') void syncNow();
};

/**
 * Start syncing for a signed-in user. Data already on this device from before accounts
 * existed is uploaded to the account; another user's leftover data is cleared first.
 * Returns how many local trips were adopted.
 */
export async function startSync(uid: string): Promise<number> {
  installHooks();
  userId = uid;
  try {
    uploaded = new Set(JSON.parse(ls.get(uploadedKey(uid)) ?? '[]'));
  } catch {
    uploaded = new Set();
  }
  const owner = ls.get(OWNER_KEY);
  let adopted = 0;
  if (owner && owner !== uid) {
    await wipeLocal();
  } else if (!owner) {
    const t = tables();
    for (const kind of KINDS) {
      const ids = (await t[kind].toCollection().primaryKeys()) as string[];
      ids.forEach((id) => outbox.set(`${kind}:${id}`, { op: 'upsert', seq: ++seq }));
      if (kind === 'trip') adopted = ids.length;
    }
    saveOutbox();
  }
  ls.set(OWNER_KEY, uid);
  setStatus({ state: 'idle' });
  clearInterval(interval);
  interval = setInterval(() => void syncNow(), 60_000);
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('online', onWake);
  await syncNow();
  return adopted;
}

/** Push what's left, then clear this device so the next person starts clean. */
export async function stopSync() {
  try {
    await syncNow();
  } catch {
    /* best effort */
  }
  clearInterval(interval);
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', onWake);
  window.removeEventListener('online', onWake);
  const uid = userId;
  userId = null;
  await wipeLocal();
  ls.del(OWNER_KEY);
  if (uid) ls.del(cursorKey(uid));
  setStatus({ state: 'off', lastSync: undefined, message: undefined });
}

export const hasUnsyncedChanges = () => outbox.size > 0;
