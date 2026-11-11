import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Entry } from '../types';
import { CATEGORIES, categoryMeta } from '../types';
import { useTripData } from '../lib/hooks';
import { blobUrl } from '../lib/media';
import { dateRange, dayKey, fmtDate, fmtTime, money, tripDays } from '../lib/format';
import { TripMap } from '../components/TripMap';
import { Stars } from '../components/Stars';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Layout';

export function PrintPage() {
  const { id } = useParams();
  const data = useTripData(id);
  const [opts, setOpts] = useState({ photos: true, costs: true, map: true, notes: true });

  const days = useMemo(() => {
    const map = new Map<string, Entry[]>();
    data?.entries.forEach((e) => map.set(dayKey(e.datetime), [...(map.get(dayKey(e.datetime)) ?? []), e]));
    return [...map];
  }, [data?.entries]);

  if (!data) return <div className="page"><div className="skeleton" /></div>;
  const { trip, entries, media, mediaByEntry, stats } = data;
  const cover = media.find((m) => m.id === trip.coverMediaId) ?? media.find((m) => m.kind === 'image');
  const start = new Date(trip.startDate + 'T12:00');
  const locIndex = new Map(entries.filter((e) => e.lat != null).map((e, i) => [e.id, i + 1]));
  const toggle = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="print-wrap">
      <div className="print-toolbar no-print">
        <Link to={`/trip/${trip.id}`} className="btn btn--ghost"><Icon name="back" size={18} /> Back</Link>
        <div className="chips">
          {(Object.keys(opts) as (keyof typeof opts)[]).map((k) => (
            <button key={k} className={`chip ${opts[k] ? 'on' : ''}`} onClick={() => toggle(k)}>
              {opts[k] && <Icon name="check" size={14} />} {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn--primary" onClick={() => window.print()}><Icon name="print" size={18} /> Print / Save PDF</button>
      </div>

      <article className="paper">
        <section className="paper__cover">
          {cover && opts.photos && <img src={blobUrl(cover.blob)} alt="" />}
          <div>
            <p className="eyebrow">{dateRange(trip.startDate, trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days</p>
            <h1 className="display">{trip.title}</h1>
            <p className="paper__dest">{trip.destination}</p>
            {trip.rating > 0 && <Stars value={trip.rating} size={20} />}
            {trip.notes && opts.notes && <p className="paper__notes">{trip.notes}</p>}
          </div>
        </section>

        <section className="paper__summary">
          <div className="kpis">
            <div><strong>{entries.length}</strong><span>stops</span></div>
            <div><strong>{Math.round(stats.km).toLocaleString()} km</strong><span>between stops</span></div>
            <div><strong>{stats.photos + stats.videos}</strong><span>memories</span></div>
            {opts.costs && <div><strong>{money(stats.total, trip.currency)}</strong><span>total spend</span></div>}
            <div><strong>{stats.avgRating ? stats.avgRating.toFixed(1) : '—'}</strong><span>avg rating</span></div>
          </div>
          {opts.costs && stats.total > 0 && (
            <table className="table table--print">
              <thead><tr><th>Category</th><th>Stops</th><th className="num">Spend</th><th className="num">Share</th></tr></thead>
              <tbody>
                {CATEGORIES.filter((c) => stats.countByCategory[c.id]).map((c) => (
                  <tr key={c.id}>
                    <td><i className="dot" style={{ background: c.color }} /> {c.label}</td>
                    <td>{stats.countByCategory[c.id]}</td>
                    <td className="num">{money(stats.byCategory[c.id] ?? 0, trip.currency)}</td>
                    <td className="num">{stats.total ? Math.round(((stats.byCategory[c.id] ?? 0) / stats.total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              {trip.budget ? <tfoot><tr><td>Budget</td><td /><td className="num">{money(trip.budget, trip.currency)}</td><td className="num">{Math.round((stats.total / trip.budget) * 100)}%</td></tr></tfoot> : null}
            </table>
          )}
        </section>

        {opts.map && stats.places > 0 && (
          <section className="paper__map">
            <h2 className="h2">The route</h2>
            <TripMap entries={entries} className="map--print" interactive={false} />
            <ol className="route-list">
              {entries.filter((e) => e.lat != null).map((e) => (
                <li key={e.id}><span className="num" style={{ ['--c' as string]: categoryMeta(e.category).color }}>{locIndex.get(e.id)}</span>{e.title || e.placeName}</li>
              ))}
            </ol>
          </section>
        )}

        {days.map(([day, list]) => {
          const n = Math.round((+new Date(day + 'T12:00') - +start) / 864e5) + 1;
          const spend = list.reduce((s, e) => s + (e.cost ?? 0), 0);
          return (
            <section key={day} className="paper__day">
              <header>
                <span className="day__n">Day {Math.max(1, n)}</span>
                <h2 className="h2">{fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                {opts.costs && spend > 0 && <span className="muted">{money(spend, trip.currency)}</span>}
              </header>
              {list.map((e) => {
                const ms = (mediaByEntry.get(e.id) ?? []).slice(0, 3);
                return (
                  <div key={e.id} className="paper__entry">
                    <div className="paper__entry-text">
                      <p className="entry__cat" style={{ ['--c' as string]: categoryMeta(e.category).color }}>
                        <i className="dot" /> {categoryMeta(e.category).label} · {fmtTime(e.datetime)}
                        {locIndex.has(e.id) && <> · stop {locIndex.get(e.id)}</>}
                      </p>
                      <h3>{e.title}</h3>
                      {e.address && <p className="small muted">{e.address}</p>}
                      <div className="row">
                        {e.rating > 0 && <Stars value={e.rating} size={13} />}
                        {opts.costs && e.cost != null && <strong>{money(e.cost, trip.currency)}</strong>}
                        {e.wouldReturn && <span className="tag tag--accent">Would return</span>}
                      </div>
                      {e.dishes.length > 0 && (
                        <ul className="entry__dishes">
                          {e.dishes.map((d, i) => (
                            <li key={i}><span>{d.name}</span>{d.rating ? <Stars value={d.rating} size={10} /> : null}{opts.costs && d.price != null && <span className="muted">{money(d.price, trip.currency)}</span>}</li>
                          ))}
                        </ul>
                      )}
                      {opts.notes && e.notes && <p className="entry__notes">{e.notes}</p>}
                    </div>
                    {opts.photos && ms.length > 0 && (
                      <div className={`paper__photos paper__photos--${ms.length}`}>
                        {ms.map((m) => <img key={m.id} src={blobUrl(m.kind === 'image' ? m.blob : m.thumb)} alt="" />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <footer className="paper__foot"><Logo /> <span className="muted small">Generated {new Date().toLocaleDateString()}</span></footer>
      </article>
    </div>
  );
}
