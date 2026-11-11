import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import type { Entry, Leg } from '../types';
import { TRAVEL_MODES, categoryMeta } from '../types';
import type { TripData } from '../lib/hooks';
import { addDays, fmtDuration, isPlanned, legForEntry, type PlanDay, type ScheduledLeg } from '../lib/itinerary';
import { dateRange, fmtDate, fmtTime, money } from '../lib/format';
import { toLocalISO } from '../lib/media';
import { Icon } from './Icon';
import { Stepper } from './Stepper';
import { TripMap } from './TripMap';
import { LegSheet, blankLeg } from './LegSheet';
import type { EntryPreset } from './EntrySheet';

export const modeLabel = (m?: string) => TRAVEL_MODES.find((x) => x.id === m)?.label ?? 'Travel';

/** Planned stops default to "planned" unless the day is already in the past. */
export function presetFor(sl: ScheduledLeg | undefined, date: string, time = '10:00'): EntryPreset {
  const today = toLocalISO(new Date()).slice(0, 10);
  return {
    legId: sl?.leg.id,
    area: sl?.leg.name,
    country: sl?.leg.country,
    datetime: `${date}T${time}`,
    status: date >= today ? 'planned' : 'done',
  };
}

/** Pseudo-stops so the shared map component can draw planned locations. */
export function legsAsEntries(legs: ScheduledLeg[]): Entry[] {
  return legs.map(({ leg }) => ({
    id: leg.id,
    tripId: leg.tripId,
    category: 'stay',
    title: leg.name,
    placeName: leg.name,
    lat: leg.lat,
    lng: leg.lng,
    datetime: '',
    rating: 0,
    notes: '',
    dishes: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }));
}

export function PlanView({
  data,
  onAddStop,
  onOpen,
}: {
  data: TripData;
  onAddStop: (preset: EntryPreset) => void;
  onOpen: (e: Entry) => void;
}) {
  const { trip, entries, schedule, legs } = data;
  const [view, setView] = useState<'overview' | 'days'>('overview');
  const [editing, setEditing] = useState<{ leg: Leg; isNew: boolean } | null>(null);
  const nav = useNavigate();

  const byLeg = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const sl = legForEntry(e, schedule);
      if (sl) m.set(sl.leg.id, [...(m.get(sl.leg.id) ?? []), e]);
    }
    return m;
  }, [entries, schedule]);

  const setTripDays = (n: number) => db.trips.update(trip.id, { endDate: addDays(trip.startDate, Math.max(1, n) - 1), updatedAt: Date.now() });
  const updateLeg = (id: string, patch: Partial<Leg>) => db.legs.update(id, { ...patch, updatedAt: Date.now() });
  const move = async (i: number, dir: -1 | 1) => {
    const a = schedule.legs[i]?.leg;
    const b = schedule.legs[i + dir]?.leg;
    if (!a || !b) return;
    await db.transaction('rw', db.legs, async () => {
      await db.legs.update(a.id, { order: b.order });
      await db.legs.update(b.id, { order: a.order });
    });
  };
  const addLeg = () => {
    const nextOrder = legs.length ? Math.max(...legs.map((l) => l.order)) + 1 : 0;
    setEditing({ leg: blankLeg(trip, nextOrder, Math.max(1, Math.min(schedule.remaining, 3))), isNew: true });
  };
  const openLeg = (sl: ScheduledLeg) => nav(`/trip/${trip.id}/place/${sl.leg.id}`);

  const { totalDays, allocated, remaining } = schedule;
  const located = schedule.legs.filter((l) => l.leg.lat != null);

  return (
    <div className="plan">
      <section className="plan__summary panel">
        <div className="plan__length">
          <div>
            <p className="eyebrow">Trip length</p>
            <p className="plan__dates">{dateRange(trip.startDate, trip.endDate)}</p>
          </div>
          <Stepper value={totalDays} min={1} onChange={setTripDays} suffix={totalDays === 1 ? 'day' : 'days'} />
        </div>
        <div className="alloc" role="img" aria-label={`${allocated} of ${totalDays} days planned`}>
          {schedule.legs.map((sl) => (
            <span key={sl.leg.id} className="alloc__seg-wrap" style={{ flex: (sl.leg.travelDays && sl.index ? sl.leg.travelDays : 0) + sl.leg.days }}>
              {sl.index > 0 && sl.leg.travelDays > 0 && <span className="alloc__seg alloc__seg--travel" style={{ flex: sl.leg.travelDays }} title={`Travel to ${sl.leg.name}`} />}
              {sl.leg.days > 0 && (
                <span className="alloc__seg" style={{ flex: sl.leg.days, background: sl.color }} title={`${sl.leg.name} · ${sl.leg.days} days`}>
                  <span>{sl.leg.name}</span>
                </span>
              )}
            </span>
          ))}
          {remaining > 0 && <span className="alloc__seg alloc__seg--free" style={{ flex: remaining }} title={`${remaining} free days`} />}
        </div>
        <div className="plan__status">
          <span>
            <strong>{allocated}</strong> of {totalDays} days planned
          </span>
          {remaining > 0 && <span className="tag">{remaining} free {remaining === 1 ? 'day' : 'days'}</span>}
          {remaining < 0 && <span className="tag tag--warn">{-remaining} {remaining === -1 ? 'day' : 'days'} over</span>}
          {remaining !== 0 && allocated > 0 && (
            <button className="link-btn" onClick={() => setTripDays(allocated)}>
              Set trip to {allocated} days
            </button>
          )}
          <span className="spacer" />
          {data.stats.plannedCount > 0 && (
            <span className="muted small">
              {data.stats.plannedCount} planned {data.stats.plannedCount === 1 ? 'stop' : 'stops'} · {money(data.stats.plannedTotal, trip.currency, true)} est.
            </span>
          )}
        </div>
      </section>

      <div className="plan__bar">
        <div className="seg seg--sm">
          <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}>
            <Icon name="route" size={15} /> Locations
          </button>
          <button className={view === 'days' ? 'on' : ''} onClick={() => setView('days')}>
            <Icon name="list" size={15} /> Day by day
          </button>
        </div>
        <button className="btn btn--primary btn--sm" onClick={addLeg}>
          <Icon name="plus" size={16} /> Add location
        </button>
      </div>

      {legs.length === 0 ? (
        <div className="empty empty--inline">
          <div className="empty__art"><Icon name="route" size={36} /></div>
          <h2>Map out your route</h2>
          <p>
            Add the places you're going and give each one some of your {totalDays} days. Add travel days between them, then plan the stops for each place
            day by day.
          </p>
          <button className="btn btn--primary" onClick={addLeg}><Icon name="plus" size={18} /> Add your first location</button>
        </div>
      ) : view === 'overview' ? (
        <div className="split">
          <ol className="legs split__main">
            {schedule.legs.map((sl, i) => {
              const list = byLeg.get(sl.leg.id) ?? [];
              const planned = list.filter(isPlanned);
              const est = planned.reduce((s, e) => s + (e.cost ?? 0), 0);
              return (
                <li key={sl.leg.id}>
                  {i > 0 && (
                    <div className="leg-travel">
                      <span className="leg-travel__line" />
                      <button className="leg-travel__mode" onClick={() => setEditing({ leg: sl.leg, isNew: false })}>
                        {modeLabel(sl.leg.travelMode)} from {schedule.legs[i - 1].leg.name}
                        {sl.leg.travelNotes && <span className="muted"> · {sl.leg.travelNotes}</span>}
                      </button>
                      <Stepper
                        size="sm"
                        value={sl.leg.travelDays}
                        onChange={(v) => updateLeg(sl.leg.id, { travelDays: v })}
                        suffix={sl.leg.travelDays === 1 ? 'travel day' : 'travel days'}
                      />
                    </div>
                  )}
                  <article className="leg" style={{ ['--c' as string]: sl.color }}>
                    <button className="leg__main" onClick={() => openLeg(sl)}>
                      <span className="leg__n">{i + 1}</span>
                      <span className="leg__text">
                        <strong>{sl.leg.name}</strong>
                        <small>
                          {sl.leg.country ? `${sl.leg.country} · ` : ''}
                          {sl.start ? `${dateRange(sl.start, sl.end)} · days ${sl.startDay}${sl.endDay > sl.startDay ? `–${sl.endDay}` : ''}` : 'No days yet'}
                        </small>
                        <small className="leg__meta">
                          {list.length} stop{list.length === 1 ? '' : 's'}
                          {planned.length > 0 && ` · ${planned.length} planned`}
                          {est > 0 && ` · ${money(est, trip.currency, true)} est.`}
                        </small>
                      </span>
                    </button>
                    <Stepper value={sl.leg.days} onChange={(v) => updateLeg(sl.leg.id, { days: v })} suffix={sl.leg.days === 1 ? 'day' : 'days'} />
                    <span className="leg__tools">
                      <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">
                        <Icon name="back" size={16} className="rot90" />
                      </button>
                      <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === schedule.legs.length - 1} aria-label="Move later">
                        <Icon name="back" size={16} className="rot-90" />
                      </button>
                      <button className="icon-btn" onClick={() => setEditing({ leg: sl.leg, isNew: false })} aria-label={`Edit ${sl.leg.name}`}>
                        <Icon name="edit" size={16} />
                      </button>
                    </span>
                  </article>
                </li>
              );
            })}
            <li>
              <button className="leg leg--add" onClick={addLeg}>
                <Icon name="plus" size={18} /> Add location
                {remaining > 0 && <span className="muted"> · {remaining} days free</span>}
              </button>
            </li>
          </ol>
          <aside className="split__side">
            {located.length > 0 ? (
              <TripMap
                entries={legsAsEntries(located)}
                className="map--side"
                onSelect={(e) => {
                  const sl = schedule.legs.find((l) => l.leg.id === e.id);
                  if (sl) openLeg(sl);
                }}
                colorFor={(e) => schedule.legs.find((l) => l.leg.id === e.id)?.color ?? '#777'}
              />
            ) : (
              <div className="map map--side map--empty">
                <p className="muted small">Pick locations from the search when adding them to see your route here.</p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <DayByDay data={data} days={schedule.days} onAddStop={onAddStop} onOpen={onOpen} onAddLeg={addLeg} onOpenLeg={openLeg} />
      )}

      {editing && (
        <LegSheet
          leg={editing.leg}
          isNew={editing.isNew}
          isFirst={editing.isNew ? legs.length === 0 : schedule.legs[0]?.leg.id === editing.leg.id}
          prevName={(() => {
            const i = schedule.legs.findIndex((l) => l.leg.id === editing.leg.id);
            return i > 0 ? schedule.legs[i - 1].leg.name : editing.isNew ? schedule.legs[schedule.legs.length - 1]?.leg.name : undefined;
          })()}
          remaining={editing.isNew ? remaining - editing.leg.days : remaining}
          stopCount={byLeg.get(editing.leg.id)?.length ?? 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function DayByDay({
  data,
  days,
  onAddStop,
  onOpen,
  onAddLeg,
  onOpenLeg,
  showLegLabel = true,
}: {
  data: TripData;
  days: PlanDay[];
  onAddStop: (preset: EntryPreset) => void;
  onOpen: (e: Entry) => void;
  onAddLeg?: () => void;
  onOpenLeg?: (sl: ScheduledLeg) => void;
  showLegLabel?: boolean;
}) {
  const { trip, entries } = data;
  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const d = e.datetime.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return m;
  }, [entries]);

  return (
    <ol className="days">
      {days.map((d) => {
        const list = byDate.get(d.date) ?? [];
        const mins = list.filter(isPlanned).reduce((s, e) => s + (e.durationMins ?? 0), 0);
        const cost = list.reduce((s, e) => s + (e.cost ?? 0), 0);
        const sl = d.kind === 'free' ? undefined : d.leg;
        const last = list[list.length - 1];
        const nextTime = last && last.datetime.length >= 16 ? nextSlot(last) : '10:00';
        return (
          <li key={d.date} className={`pday pday--${d.kind}`} style={sl ? { ['--c' as string]: sl.color } : undefined}>
            <header className="pday__head">
              <span className="pday__n">Day {d.n}</span>
              <strong>{fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              {showLegLabel && d.kind === 'stay' && (
                <button className="pday__leg" onClick={() => onOpenLeg?.(d.leg)}>
                  <i className="dot" /> {d.leg.leg.name}
                  <span className="muted"> · day {d.dayOfLeg} of {d.leg.leg.days}</span>
                </button>
              )}
              {d.kind === 'travel' && (
                <span className="pday__leg pday__leg--travel">
                  <Icon name="route" size={14} /> {modeLabel(d.leg.leg.travelMode)}
                  {d.from ? ` ${d.from.leg.name} → ` : ' to '}
                  {d.leg.leg.name}
                </span>
              )}
              {d.kind === 'free' && <span className="pday__leg muted">Unplanned day</span>}
              <span className="spacer" />
              {(mins > 0 || cost > 0) && (
                <span className="muted small">
                  {mins > 0 && `~${fmtDuration(mins)}`}
                  {mins > 0 && cost > 0 && ' · '}
                  {cost > 0 && money(cost, trip.currency, true)}
                </span>
              )}
            </header>
            {list.length > 0 && (
              <ul className="pday__stops">
                {list.map((e) => (
                  <li key={e.id}>
                    <button className={`pstop ${isPlanned(e) ? 'pstop--planned' : ''}`} onClick={() => onOpen(e)} style={{ ['--k' as string]: categoryMeta(e.category).color }}>
                      <span className="pstop__time">{fmtTime(e.datetime)}</span>
                      <i className="pstop__dot" />
                      <span className="pstop__title">{e.title || e.placeName}</span>
                      {isPlanned(e) ? <span className="tag">Planned{e.durationMins ? ` · ${fmtDuration(e.durationMins)}` : ''}</span> : <Icon name="check" size={14} />}
                      {e.cost != null && <span className="pstop__cost">{money(e.cost, trip.currency)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="pday__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => onAddStop(presetFor(sl, d.date, nextTime))}>
                <Icon name="plus" size={15} /> Add stop
              </button>
              {d.kind === 'free' && onAddLeg && (
                <button className="link-btn" onClick={onAddLeg}>
                  Assign a location
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A sensible start time for the next stop: the last stop's time plus its estimated length (or 2h), capped at 22:00. */
function nextSlot(last: Entry) {
  const [h, m] = last.datetime.slice(11, 16).split(':').map(Number);
  const mins = Math.min(22 * 60, h * 60 + m + (last.durationMins ?? 120));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
