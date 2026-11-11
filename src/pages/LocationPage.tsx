import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Entry, Media } from '../types';
import { useTripData } from '../lib/hooks';
import { isPlanned, legForEntry } from '../lib/itinerary';
import { dateRange, money } from '../lib/format';
import { Icon } from '../components/Icon';
import { Stars } from '../components/Stars';
import { Thumb } from '../components/Thumb';
import { TripMap } from '../components/TripMap';
import { EntryCard } from '../components/EntryCard';
import { EntrySheet, blankEntry, type EntryPreset } from '../components/EntrySheet';
import { LegSheet } from '../components/LegSheet';
import { Lightbox } from '../components/Lightbox';
import { DayByDay, legsAsEntries, modeLabel, presetFor } from '../components/PlanView';

/** Overview of one planned location: its days, stops, spend and photos. */
export function LocationPage() {
  const { id, legId } = useParams();
  const data = useTripData(id);
  const nav = useNavigate();
  const [editing, setEditing] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [editLeg, setEditLeg] = useState(false);
  const [viewer, setViewer] = useState<{ items: Media[]; start: Media } | null>(null);

  const sl = data?.schedule.legs.find((l) => l.leg.id === legId);
  const stops = useMemo(
    () => (data && sl ? data.entries.filter((e) => legForEntry(e, data.schedule)?.leg.id === sl.leg.id) : []),
    [data, sl],
  );

  if (data === undefined) return <div className="page"><div className="skeleton" /></div>;
  if (!data || !sl)
    return (
      <div className="page empty">
        <h2>Location not found</h2>
        <Link to={id ? `/trip/${id}?tab=plan` : '/'} className="btn btn--ghost">Back to the plan</Link>
      </div>
    );

  const { trip, schedule, mediaByEntry } = data;
  const { leg } = sl;
  const i = sl.index;
  const prev = schedule.legs[i - 1];
  const next = schedule.legs[i + 1];
  const days = schedule.days.filter((d) => d.kind !== 'free' && d.leg.leg.id === leg.id);
  const dayDates = new Set(days.map((d) => d.date));
  const offDays = stops.filter((e) => !dayDates.has(e.datetime.slice(0, 10)));
  const done = stops.filter((e) => !isPlanned(e));
  const planned = stops.filter(isPlanned);
  const spent = done.reduce((s, e) => s + (e.cost ?? 0), 0);
  const est = planned.reduce((s, e) => s + (e.cost ?? 0), 0);
  const photos = stops.flatMap((e) => mediaByEntry.get(e.id) ?? []);
  const rated = done.filter((e) => e.rating > 0);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
  const located = stops.filter((e) => e.lat != null);
  const firstDay = sl.start || sl.travelStart || trip.startDate;

  const addStop = (preset: EntryPreset) => setEditing({ entry: blankEntry(trip, 'attraction', { lat: leg.lat, lng: leg.lng, ...preset }), isNew: true });
  const open = (e: Entry) => setEditing({ entry: e, isNew: false });

  return (
    <div className="page page--narrowish">
      <div className="loc-nav">
        <Link to={`/trip/${trip.id}?tab=plan`} className="btn btn--ghost btn--sm">
          <Icon name="back" size={16} /> {trip.title} plan
        </Link>
        <span className="spacer" />
        <button className="icon-btn" disabled={!prev} onClick={() => prev && nav(`/trip/${trip.id}/place/${prev.leg.id}`, { replace: true })} aria-label="Previous location" title={prev?.leg.name}>
          <Icon name="back" />
        </button>
        <span className="small muted">{i + 1} / {schedule.legs.length}</span>
        <button className="icon-btn" disabled={!next} onClick={() => next && nav(`/trip/${trip.id}/place/${next.leg.id}`, { replace: true })} aria-label="Next location" title={next?.leg.name}>
          <Icon name="back" className="flip" />
        </button>
      </div>

      <header className="loc-head" style={{ ['--c' as string]: sl.color }}>
        <div className="loc-head__text">
          <p className="eyebrow">
            Location {i + 1}
            {leg.country ? ` · ${leg.country}` : ''}
          </p>
          <h1 className="display">{leg.name}</h1>
          <p className="loc-head__dates">
            {sl.start ? dateRange(sl.start, sl.end) : 'No days allocated'} · {leg.days} {leg.days === 1 ? 'day' : 'days'}
            {sl.start && ` (trip days ${sl.startDay}${sl.endDay > sl.startDay ? `–${sl.endDay}` : ''})`}
          </p>
          {prev && (
            <p className="muted small">
              <Icon name="route" size={14} /> {modeLabel(leg.travelMode)} from {prev.leg.name}
              {leg.travelDays > 0 ? ` · ${leg.travelDays} travel ${leg.travelDays === 1 ? 'day' : 'days'}` : ' · same day'}
              {leg.travelNotes && ` · ${leg.travelNotes}`}
            </p>
          )}
        </div>
        <div className="row">
          <button className="btn btn--ghost" onClick={() => setEditLeg(true)}><Icon name="edit" size={16} /> Edit</button>
          <button className="btn btn--primary" onClick={() => addStop(presetFor(sl, firstDay))}><Icon name="plus" size={18} /> Add stop</button>
        </div>
      </header>

      <div className="kpis kpis--sm">
        <div><strong>{stops.length}</strong><span>stops</span></div>
        <div><strong>{planned.length}</strong><span>planned</span></div>
        <div><strong>{money(spent, trip.currency, true)}</strong><span>spent</span></div>
        <div><strong>{est ? money(est, trip.currency, true) : '—'}</strong><span>planned est.</span></div>
        <div><strong>{avg ? avg.toFixed(1) : '—'}</strong><span>avg rating</span></div>
      </div>

      {leg.notes && <p className="loc-notes">{leg.notes}</p>}

      {(located.length > 0 || leg.lat != null) && (
        <TripMap
          entries={located.length ? located : legsAsEntries([sl])}
          className="map--loc"
          showRoute={located.length > 1}
          onSelect={(e) => {
            const hit = stops.find((s) => s.id === e.id);
            if (hit) open(hit);
          }}
          colorFor={located.length ? undefined : () => sl.color}
        />
      )}

      {photos.length > 0 && (
        <div className="loc-photos">
          {photos.slice(0, 12).map((m) => <Thumb key={m.id} m={m} onClick={() => setViewer({ items: photos, start: m })} />)}
        </div>
      )}

      <h2 className="h2 loc-sub">Day by day</h2>
      {days.length ? (
        <DayByDay data={data} days={days} onAddStop={addStop} onOpen={open} showLegLabel={false} />
      ) : (
        <p className="muted">Give {leg.name} some days in the plan to break it down by day.</p>
      )}

      {offDays.length > 0 && (
        <>
          <h2 className="h2 loc-sub">Other stops linked to {leg.name}</h2>
          <p className="muted small">These are dated outside {leg.name}'s planned days.</p>
          {offDays.map((e) => (
            <EntryCard key={e.id} entry={e} media={mediaByEntry.get(e.id) ?? []} currency={trip.currency} onOpen={() => open(e)} onMedia={(m) => setViewer({ items: photos, start: m })} />
          ))}
        </>
      )}

      {rated.length > 0 && (
        <>
          <h2 className="h2 loc-sub">Top rated here</h2>
          <ul className="toplist">
            {[...rated].sort((a, b) => b.rating - a.rating).slice(0, 5).map((e) => (
              <li key={e.id}><button onClick={() => open(e)}><span>{e.title}</span><Stars value={e.rating} size={13} /></button></li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <EntrySheet trip={trip} entry={editing.entry} isNew={editing.isNew} media={mediaByEntry.get(editing.entry.id) ?? []} onClose={() => setEditing(null)} />
      )}
      {editLeg && (
        <LegSheet
          leg={leg}
          isNew={false}
          isFirst={i === 0}
          prevName={prev?.leg.name}
          remaining={schedule.remaining}
          stopCount={stops.length}
          onClose={() => setEditLeg(false)}
          onRemoved={() => nav(`/trip/${trip.id}?tab=plan`, { replace: true })}
        />
      )}
      {viewer && <Lightbox items={viewer.items} start={viewer.start} entries={data.entries} coverId={trip.coverMediaId} onClose={() => setViewer(null)} />}
    </div>
  );
}
