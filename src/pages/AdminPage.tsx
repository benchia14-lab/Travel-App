import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { Entry, Media, Trip } from '../types';
import { categoryMeta } from '../types';
import { adminResetPin, useAccount, type Profile } from '../lib/account';
import { MEDIA_BUCKET, supabase } from '../lib/supabase';
import { dateRange, fmtDate, money } from '../lib/format';
import { Icon } from '../components/Icon';
import { Stars } from '../components/Stars';
import { useToast } from '../components/Toast';

interface Rec {
  user_id: string;
  kind: 'trip' | 'entry' | 'leg' | 'media';
  id: string;
  data: Record<string, unknown>;
}

/** Admin: every account and everything they've logged (read-only), plus PIN resets. */
export function AdminPage() {
  const { profile } = useAccount();
  const toast = useToast();
  const [profiles, setProfiles] = useState<Profile[]>();
  const [records, setRecords] = useState<Rec[]>([]);
  const [err, setErr] = useState('');
  const [openUser, setOpenUser] = useState<string>();
  const [openTrip, setOpenTrip] = useState<string>();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');

  const load = async () => {
    setErr('');
    const [p, r] = await Promise.all([
      supabase.from('wf_profiles').select('*').order('created_at', { ascending: true }),
      // Media rows only carry metadata; the photos themselves stay in Storage until opened.
      supabase.from('wf_records').select('user_id,kind,id,data').eq('deleted', false).limit(20000),
    ]);
    if (p.error || r.error) return setErr((p.error ?? r.error)!.message);
    setProfiles(p.data as Profile[]);
    setRecords(r.data as Rec[]);
  };
  useEffect(() => {
    if (profile?.is_admin) void load();
  }, [profile?.is_admin]);

  const byUser = useMemo(() => {
    const m = new Map<string, { trips: Trip[]; entries: Entry[]; media: Media[]; legs: number }>();
    for (const r of records) {
      const u = m.get(r.user_id) ?? { trips: [], entries: [], media: [], legs: 0 };
      if (r.kind === 'trip') u.trips.push(r.data as unknown as Trip);
      else if (r.kind === 'entry') u.entries.push(r.data as unknown as Entry);
      else if (r.kind === 'media') u.media.push(r.data as unknown as Media);
      else u.legs++;
      m.set(r.user_id, u);
    }
    return m;
  }, [records]);

  // Signed links for the open trip's photo thumbnails.
  useEffect(() => {
    if (!openTrip || !openUser) return;
    const media = byUser.get(openUser)?.media.filter((m) => m.tripId === openTrip && !thumbs[m.id]).slice(0, 60) ?? [];
    if (!media.length) return;
    supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(media.map((m) => `${openUser}/${m.id}_thumb`), 3600)
      .then(({ data }) => {
        if (!data) return;
        const next: Record<string, string> = {};
        data.forEach((d, i) => d.signedUrl && (next[media[i].id] = d.signedUrl));
        setThumbs((t) => ({ ...t, ...next }));
      });
  }, [openTrip, openUser, byUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile && !profile.is_admin) return <Navigate to="/" replace />;

  const totals = { users: profiles?.length ?? 0, trips: 0, stops: 0, photos: 0 };
  byUser.forEach((u) => {
    totals.trips += u.trips.length;
    totals.stops += u.entries.length;
    totals.photos += u.media.length;
  });
  const shown = (profiles ?? []).filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase()));

  const resetPin = async (p: Profile) => {
    const pin = prompt(`New 4-digit PIN for ${p.first_name} ${p.last_name}:`);
    if (pin == null) return;
    try {
      await adminResetPin(p, pin.trim());
      toast(`PIN reset for ${p.first_name}. Let them know their new PIN.`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display">Everyone’s journeys</h1>
        </div>
        <button className="btn btn--ghost" onClick={load}>Refresh</button>
      </header>
      {err && <p className="notice">{err}</p>}

      <div className="kpis">
        <div><strong>{totals.users}</strong><span>accounts</span></div>
        <div><strong>{totals.trips}</strong><span>trips</span></div>
        <div><strong>{totals.stops}</strong><span>stops</span></div>
        <div><strong>{totals.photos}</strong><span>photos & videos</span></div>
      </div>

      <div className="search admin__search">
        <Icon name="search" size={18} />
        <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!profiles && !err && <div className="skeleton" />}
      <ul className="admin__users">
        {shown.map((p) => {
          const u = byUser.get(p.id) ?? { trips: [], entries: [], media: [], legs: 0 };
          const open = openUser === p.id;
          return (
            <li key={p.id} className={`panel admin__user ${open ? 'on' : ''}`}>
              <div className="admin__row">
                <button className="admin__who" onClick={() => { setOpenUser(open ? undefined : p.id); setOpenTrip(undefined); }}>
                  <span className="avatar">{p.first_name[0]}{p.last_name[0]}</span>
                  <span>
                    <strong>{p.first_name} {p.last_name}</strong>
                    {p.is_admin && <span className="tag tag--accent">Admin</span>}
                    <small className="muted">
                      Joined {fmtDate(p.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · last seen {fmtDate(p.last_seen_at, { day: 'numeric', month: 'short' })}
                    </small>
                  </span>
                </button>
                <span className="admin__counts small muted">
                  {u.trips.length} trips · {u.entries.length} stops · {u.media.length} photos
                </span>
                <button className="btn btn--ghost btn--sm" onClick={() => resetPin(p)}>Reset PIN</button>
              </div>
              {open && (
                <div className="admin__trips">
                  {u.trips.length === 0 && <p className="muted small">No trips yet.</p>}
                  {[...u.trips].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')).map((t) => {
                    const stops = u.entries.filter((e) => e.tripId === t.id).sort((a, b) => a.datetime.localeCompare(b.datetime));
                    const spent = stops.filter((e) => e.status !== 'planned').reduce((s, e) => s + (e.cost ?? 0), 0);
                    const tOpen = openTrip === t.id;
                    const photos = u.media.filter((m) => m.tripId === t.id);
                    return (
                      <div key={t.id} className="admin__trip">
                        <button className="admin__trip-head" onClick={() => setOpenTrip(tOpen ? undefined : t.id)}>
                          <span>
                            <strong>{t.title}</strong>
                            <small className="muted">{t.destination ? `${t.destination} · ` : ''}{dateRange(t.startDate, t.endDate)}</small>
                          </span>
                          <span className="small muted">{stops.length} stops · {photos.length} photos · {money(spent, t.currency || 'USD', true)}</span>
                          <Icon name="back" size={16} className={tOpen ? 'rot90' : 'rot-90'} />
                        </button>
                        {tOpen && (
                          <div className="admin__trip-body">
                            {photos.length > 0 && (
                              <div className="loc-photos">
                                {photos.slice(0, 60).map((m) => (
                                  <div key={m.id} className="thumb">{thumbs[m.id] ? <img src={thumbs[m.id]} alt="" loading="lazy" /> : null}</div>
                                ))}
                              </div>
                            )}
                            <table className="table">
                              <tbody>
                                {stops.map((e) => (
                                  <tr key={e.id}>
                                    <td><i className="dot" style={{ background: categoryMeta(e.category).color }} /></td>
                                    <td>
                                      {e.title || e.placeName}
                                      {e.status === 'planned' && <span className="tag">Planned</span>}
                                      <div className="small muted">{fmtDate(e.datetime, { weekday: 'short', day: 'numeric', month: 'short' })}{e.area ? ` · ${e.area}` : ''}</div>
                                    </td>
                                    <td>{e.rating > 0 && <Stars value={e.rating} size={12} />}</td>
                                    <td className="num">{e.cost != null ? money(e.cost, t.currency || 'USD') : ''}</td>
                                  </tr>
                                ))}
                                {!stops.length && <tr><td /><td className="muted small">No stops logged.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
