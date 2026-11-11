import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Category, Entry, Media } from '../types';
import { CATEGORIES, categoryMeta } from '../types';
import { useTripData, type TripData } from '../lib/hooks';
import { blobUrl } from '../lib/media';
import { dateRange, dayKey, fmtDate, money, tripDays } from '../lib/format';
import { usePlan } from '../lib/plan';
import { Icon } from '../components/Icon';
import { Stars } from '../components/Stars';
import { TripMap } from '../components/TripMap';
import { EntryCard } from '../components/EntryCard';
import { EntrySheet, blankEntry } from '../components/EntrySheet';
import { TripForm } from '../components/TripForm';
import { ImportSheet } from '../components/ImportSheet';
import { Lightbox } from '../components/Lightbox';
import { Thumb } from '../components/Thumb';

type Tab = 'journal' | 'map' | 'food' | 'activities' | 'spend' | 'gallery';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'journal', label: 'Journal', icon: 'list' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'food', label: 'Food log', icon: 'fork' },
  { id: 'activities', label: 'Activities', icon: 'ticket' },
  { id: 'spend', label: 'Spend', icon: 'wallet' },
  { id: 'gallery', label: 'Gallery', icon: 'image' },
];

export function TripPage() {
  const { id } = useParams();
  const data = useTripData(id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'journal';
  const [editing, setEditing] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [editTrip, setEditTrip] = useState(false);
  const [importing, setImporting] = useState(false);
  const [viewer, setViewer] = useState<{ items: Media[]; start: Media } | null>(null);
  const [active, setActive] = useState<string>();
  const nav = useNavigate();
  const plan = usePlan();

  if (data === undefined) return <div className="page"><div className="skeleton" /></div>;
  if (data === null)
    return (
      <div className="page empty">
        <h2>Trip not found</h2>
        <Link to="/" className="btn btn--ghost">Back to journeys</Link>
      </div>
    );

  const { trip, entries, media, mediaByEntry, stats } = data;
  const cover = media.find((m) => m.id === trip.coverMediaId) ?? media.find((m) => m.kind === 'image');
  const add = (c: Category = 'food') => setEditing({ entry: blankEntry(trip, c), isNew: true });
  const open = (e: Entry) => setEditing({ entry: e, isNew: false });
  const view = (items: Media[]) => (m: Media) => setViewer({ items, start: m });

  return (
    <div className="page page--trip">
      <header className={`hero ${cover ? 'hero--img' : ''}`}>
        {cover && <img className="hero__img" src={blobUrl(cover.blob)} alt="" />}
        <div className="hero__scrim" />
        <div className="hero__top">
          <Link to="/" className="icon-btn icon-btn--glass" aria-label="All trips">
            <Icon name="back" />
          </Link>
          <div className="row">
            <button className="icon-btn icon-btn--glass" onClick={() => setEditTrip(true)} aria-label="Edit trip">
              <Icon name="edit" />
            </button>
          </div>
        </div>
        <div className="hero__content">
          <p className="eyebrow">
            {dateRange(trip.startDate, trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days
          </p>
          <h1 className="display">{trip.title}</h1>
          <p className="hero__dest">{trip.destination}</p>
          <div className="hero__stats">
            <span><strong>{entries.length}</strong> stops</span>
            <span><strong>{stats.km >= 1 ? Math.round(stats.km).toLocaleString() : stats.km.toFixed(1)}</strong> km</span>
            <span><strong>{stats.photos + stats.videos}</strong> memories</span>
            <span><strong>{money(stats.total, trip.currency, true)}</strong> spent</span>
            <button className="hero__rating" onClick={() => setEditTrip(true)} title="Rate this trip">
              <Stars value={trip.rating} size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="actionbar">
        <button className="btn btn--primary" onClick={() => add()}>
          <Icon name="plus" size={18} /> Add stop
        </button>
        <button className="btn btn--ghost" onClick={() => setImporting(true)}>
          <Icon name="camera" size={18} /> Import photos
        </button>
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={() => nav(plan.tier === 'pro' ? `/trip/${trip.id}/print` : '/pro?reason=print')}>
          <Icon name={plan.tier === 'pro' ? 'print' : 'lock'} size={18} /> <span className="hide-sm">Print journal</span><span className="show-sm">Print</span>
        </button>
        <button className="btn btn--ink" onClick={() => nav(`/trip/${trip.id}/share`)}>
          <Icon name="share" size={18} /> <span className="hide-sm">Share story</span><span className="show-sm">Share</span>
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setParams(t.id === 'journal' ? {} : { tab: t.id }, { replace: true })}
          >
            <Icon name={t.icon} size={17} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'journal' && (
        <div className="split">
          <div className="split__main">
            {entries.length === 0 ? (
              <EmptyStops onAdd={() => add()} onImport={() => setImporting(true)} />
            ) : (
              <Journal data={data} active={active} setActive={setActive} onOpen={open} onMedia={(m) => view(media)(m)} />
            )}
          </div>
          <aside className="split__side">
            <TripMap entries={entries} media={media} activeId={active} onSelect={(e) => { setActive(e.id); document.getElementById(`e-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="map--side" />
          </aside>
        </div>
      )}

      {tab === 'map' && (
        <div className="mapview">
          <TripMap entries={entries} media={media} activeId={active} onSelect={(e) => setActive(e.id)} className="map--full" />
          <ol className="mapview__list">
            {entries.filter((e) => e.lat != null).map((e, i) => (
              <li key={e.id} className={active === e.id ? 'on' : ''}>
                <button onClick={() => setActive(e.id)} onDoubleClick={() => open(e)}>
                  <span className="num" style={{ ['--c' as string]: categoryMeta(e.category).color }}>{i + 1}</span>
                  <span>
                    <strong>{e.title || e.placeName}</strong>
                    <small>{fmtDate(e.datetime, { weekday: 'short', month: 'short', day: 'numeric' })}</small>
                  </span>
                  {e.rating > 0 && <Stars value={e.rating} size={12} />}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'food' && (
        <Collection
          data={data}
          cats={['food']}
          title="Food log"
          subtitle="Restaurants, cafés and bars — what you ordered, what it cost, and how it rated."
          onAdd={() => add('food')}
          onOpen={open}
          onMedia={view(media)}
        />
      )}
      {tab === 'activities' && (
        <Collection
          data={data}
          cats={['attraction', 'activity']}
          title="Attractions & activities"
          subtitle="Sights, tours and experiences with tickets, costs and ratings."
          onAdd={() => add('attraction')}
          onOpen={open}
          onMedia={view(media)}
        />
      )}
      {tab === 'spend' && <Spend data={data} onOpen={open} />}
      {tab === 'gallery' && (
        <div className="gallery">
          {media.length === 0 && <EmptyStops onAdd={() => add()} onImport={() => setImporting(true)} />}
          {media.map((m) => (
            <Thumb key={m.id} m={m} onClick={() => setViewer({ items: media, start: m })} className={m.entryId ? '' : 'thumb--loose'} />
          ))}
        </div>
      )}

      <button className="fab" onClick={() => add()} aria-label="Add stop">
        <Icon name="plus" size={26} />
      </button>

      {editing && (
        <EntrySheet
          trip={trip}
          entry={editing.entry}
          isNew={editing.isNew}
          media={mediaByEntry.get(editing.entry.id) ?? []}
          tripMediaCount={media.length}
          onClose={() => setEditing(null)}
        />
      )}
      {editTrip && <TripForm trip={trip} onClose={() => setEditTrip(false)} />}
      {importing && <ImportSheet trip={trip} tripMediaCount={media.length} onClose={() => setImporting(false)} />}
      {viewer && <Lightbox items={viewer.items} start={viewer.start} entries={entries} coverId={trip.coverMediaId} onClose={() => setViewer(null)} />}
    </div>
  );
}

function EmptyStops({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="empty empty--inline">
      <h2>Nothing logged yet</h2>
      <p>Add a stop as you go, or import a batch of photos — we'll place them on the map using their GPS data.</p>
      <div className="row">
        <button className="btn btn--primary" onClick={onAdd}><Icon name="plus" size={18} /> Add a stop</button>
        <button className="btn btn--ghost" onClick={onImport}><Icon name="camera" size={18} /> Import photos</button>
      </div>
    </div>
  );
}

function Journal({
  data,
  active,
  setActive,
  onOpen,
  onMedia,
}: {
  data: TripData;
  active?: string;
  setActive: (id?: string) => void;
  onOpen: (e: Entry) => void;
  onMedia: (m: Media) => void;
}) {
  const { trip, entries, mediaByEntry } = data;
  const days = useMemo(() => {
    const map = new Map<string, Entry[]>();
    entries.forEach((e) => {
      const k = dayKey(e.datetime);
      map.set(k, [...(map.get(k) ?? []), e]);
    });
    return [...map];
  }, [entries]);
  const locIndex = new Map(entries.filter((e) => e.lat != null).map((e, i) => [e.id, i]));
  const start = new Date(trip.startDate + 'T12:00');

  return (
    <div className="journal">
      {days.map(([day, list]) => {
        const n = Math.round((+new Date(day + 'T12:00') - +start) / 864e5) + 1;
        const spend = list.reduce((s, e) => s + (e.cost ?? 0), 0);
        return (
          <section key={day} className="day">
            <header className="day__head">
              <span className="day__n">{n >= 1 ? `Day ${n}` : 'Before'}</span>
              <h2>{fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
              {spend > 0 && <span className="muted">{money(spend, trip.currency)}</span>}
            </header>
            {list.map((e) => (
              <div key={e.id} id={`e-${e.id}`}>
                <EntryCard
                  entry={e}
                  media={mediaByEntry.get(e.id) ?? []}
                  index={locIndex.get(e.id)}
                  currency={trip.currency}
                  active={active === e.id}
                  onOpen={() => onOpen(e)}
                  onMedia={onMedia}
                  onHover={(on) => setActive(on ? e.id : undefined)}
                />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Collection({
  data,
  cats,
  title,
  subtitle,
  onAdd,
  onOpen,
  onMedia,
}: {
  data: TripData;
  cats: Category[];
  title: string;
  subtitle: string;
  onAdd: () => void;
  onOpen: (e: Entry) => void;
  onMedia: (m: Media) => void;
}) {
  const { trip, entries, mediaByEntry } = data;
  const [sort, setSort] = useState<'date' | 'rating' | 'cost'>('date');
  const list = entries
    .filter((e) => cats.includes(e.category))
    .sort((a, b) => (sort === 'rating' ? b.rating - a.rating : sort === 'cost' ? (b.cost ?? 0) - (a.cost ?? 0) : a.datetime.localeCompare(b.datetime)));
  const total = list.reduce((s, e) => s + (e.cost ?? 0), 0);
  const rated = list.filter((e) => e.rating > 0);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;

  return (
    <div className="collection">
      <header className="collection__head">
        <div>
          <h2 className="h2">{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <button className="btn btn--primary" onClick={onAdd}><Icon name="plus" size={18} /> Add</button>
      </header>
      <div className="kpis kpis--sm">
        <div><strong>{list.length}</strong><span>logged</span></div>
        <div><strong>{money(total, trip.currency, true)}</strong><span>spent</span></div>
        <div><strong>{list.length ? money(total / list.length, trip.currency, true) : '—'}</strong><span>average</span></div>
        <div><strong>{avg ? avg.toFixed(1) : '—'}</strong><span>avg rating</span></div>
      </div>
      <div className="seg seg--sm">
        {(['date', 'rating', 'cost'] as const).map((s) => (
          <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
            {s === 'date' ? 'Chronological' : s === 'rating' ? 'Top rated' : 'Most expensive'}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="muted pad">Nothing here yet.</p>
      ) : (
        <div className="cards">
          {list.map((e) => {
            const ms = mediaByEntry.get(e.id) ?? [];
            return (
              <article key={e.id} className="card" onClick={() => onOpen(e)} style={{ ['--c' as string]: categoryMeta(e.category).color }}>
                <div className="card__img" onClick={(ev) => { if (ms[0]) { ev.stopPropagation(); onMedia(ms[0]); } }}>
                  {ms[0] ? <img src={blobUrl(ms[0].thumb)} alt="" /> : <Icon name={e.category === 'food' ? 'fork' : 'ticket'} size={28} />}
                  {ms.length > 1 && <span className="card__count">{ms.length}</span>}
                </div>
                <div className="card__body">
                  <p className="entry__cat"><i className="dot" /> {categoryMeta(e.category).label} · {fmtDate(e.datetime)}</p>
                  <h3>{e.title}</h3>
                  {e.placeName !== e.title && <p className="muted small">{e.placeName}</p>}
                  <div className="card__foot">
                    <Stars value={e.rating} size={13} />
                    <span className="entry__cost">{money(e.cost, trip.currency)}</span>
                  </div>
                  {e.dishes.length > 0 && <p className="small muted">{e.dishes.map((d) => d.name).join(' · ')}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Spend({ data, onOpen }: { data: TripData; onOpen: (e: Entry) => void }) {
  const { trip, entries, stats } = data;
  const max = Math.max(...Object.values(stats.byCategory), 1);
  const dayMax = Math.max(...stats.byDay.map((d) => d.total), 1);
  const pct = trip.budget ? Math.min(100, (stats.total / trip.budget) * 100) : 0;
  const days = tripDays(trip.startDate, trip.endDate);
  const costed = entries.filter((e) => e.cost).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));

  return (
    <div className="spend">
      <div className="spend__top">
        <div className="panel">
          <p className="eyebrow">Total spent</p>
          <p className="big">{money(stats.total, trip.currency)}</p>
          <p className="muted">{money(stats.total / days, trip.currency)} per day · {costed.length} expenses</p>
          {trip.budget ? (
            <div className="budget">
              <div className="budget__bar"><span style={{ width: `${pct}%` }} className={stats.total > trip.budget ? 'over' : ''} /></div>
              <p className="small muted">
                {stats.total > trip.budget
                  ? `${money(stats.total - trip.budget, trip.currency)} over budget`
                  : `${money(trip.budget - stats.total, trip.currency)} left of ${money(trip.budget, trip.currency)}`}
              </p>
            </div>
          ) : (
            <p className="small muted">Set a budget in trip details to track it here.</p>
          )}
        </div>
        <div className="panel">
          <p className="eyebrow">By category</p>
          <ul className="bars">
            {CATEGORIES.filter((c) => stats.byCategory[c.id]).sort((a, b) => stats.byCategory[b.id] - stats.byCategory[a.id]).map((c) => (
              <li key={c.id}>
                <span className="bars__label">{c.label}</span>
                <span className="bars__track"><span style={{ width: `${(stats.byCategory[c.id] / max) * 100}%`, background: c.color }} /></span>
                <span className="bars__val">{money(stats.byCategory[c.id], trip.currency, true)}</span>
              </li>
            ))}
            {!stats.total && <li className="muted small">No costs logged yet.</li>}
          </ul>
        </div>
      </div>
      {stats.byDay.length > 0 && (
        <div className="panel">
          <p className="eyebrow">By day</p>
          <div className="cols">
            {stats.byDay.map((d) => (
              <div key={d.day} className="cols__c" title={money(d.total, trip.currency)}>
                <span className="cols__v">{d.total ? money(d.total, trip.currency, true) : ''}</span>
                <span className="cols__bar" style={{ height: `${(d.total / dayMax) * 100}%` }} />
                <span className="cols__l">{fmtDate(d.day, { month: 'numeric', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="panel">
        <p className="eyebrow">All expenses</p>
        <table className="table">
          <tbody>
            {costed.map((e) => (
              <tr key={e.id} onClick={() => onOpen(e)}>
                <td><i className="dot" style={{ background: categoryMeta(e.category).color }} /></td>
                <td>{e.title}<div className="small muted">{fmtDate(e.datetime, { weekday: 'short', month: 'short', day: 'numeric' })}</div></td>
                <td className="num">{money(e.cost, trip.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {costed.length > 0 && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              const rows = [['Date', 'Category', 'Name', 'Place', `Cost (${trip.currency})`, 'Rating']].concat(
                entries.map((e) => [e.datetime, categoryMeta(e.category).label, e.title, e.placeName, String(e.cost ?? ''), String(e.rating || '')]),
              );
              const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
              a.download = `${trip.title.replace(/\W+/g, '-')}-expenses.csv`;
              a.click();
            }}
          >
            <Icon name="download" size={16} /> Export CSV
          </button>
        )}
      </div>
    </div>
  );
}
