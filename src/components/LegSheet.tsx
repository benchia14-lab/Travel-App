import { useEffect, useState } from 'react';
import { db, uid } from '../db';
import type { Leg, Trip } from '../types';
import { TRAVEL_MODES } from '../types';
import { searchPlaces, type Place } from '../lib/geo';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { Stepper } from './Stepper';

export function blankLeg(trip: Trip, order: number, days = 1): Leg {
  return {
    id: uid(),
    tripId: trip.id,
    order,
    name: '',
    days,
    travelDays: 0,
    travelMode: order > 0 ? 'train' : undefined,
    notes: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Add or edit a planned location: where, how many days, and how you get there. */
export function LegSheet({
  leg: initial,
  isNew,
  isFirst,
  prevName,
  remaining,
  stopCount,
  onClose,
  onRemoved,
}: {
  leg: Leg;
  isNew: boolean;
  isFirst: boolean;
  prevName?: string;
  remaining: number;
  stopCount: number;
  onClose: () => void;
  onRemoved?: () => void;
}) {
  const [l, setL] = useState<Leg>(initial);
  const [q, setQ] = useState(initial.name);
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const set = <K extends keyof Leg>(k: K, v: Leg[K]) => setL((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!q.trim() || q === l.name) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: Place) => {
    const name = p.area && p.name !== p.area && p.address.split(',').length > 3 ? p.area : p.name;
    setL((prev) => ({ ...prev, name, country: p.country ?? prev.country, lat: p.lat, lng: p.lng }));
    setQ(name);
    setResults([]);
  };

  const save = async () => {
    const name = (l.name || q).trim() || 'New location';
    await db.legs.put({ ...l, name, updatedAt: Date.now() });
    onClose();
  };

  const remove = async () => {
    const msg = stopCount
      ? `Remove “${l.name}” from the plan? Its ${stopCount} stop${stopCount === 1 ? '' : 's'} stay in your journal.`
      : `Remove “${l.name}” from the plan?`;
    if (!confirm(msg)) return;
    await db.transaction('rw', db.legs, db.entries, async () => {
      await db.entries.where('legId').equals(l.id).modify({ legId: undefined });
      await db.legs.delete(l.id);
    });
    onClose();
    onRemoved?.();
  };

  return (
    <Sheet
      title={isNew ? 'Add a location' : 'Edit location'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button className="btn btn--ghost btn--danger" onClick={remove}>
              <Icon name="trash" size={18} /> Remove
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save}>{isNew ? 'Add to plan' : 'Save'}</button>
        </>
      }
    >
      <section className="field">
        <label className="field__label">City, town or region</label>
        <div className="search">
          <Icon name="search" size={18} />
          <input
            className="input input--lg"
            placeholder="e.g. Kyoto"
            value={q}
            autoFocus={isNew}
            onChange={(ev) => {
              setQ(ev.target.value);
              set('name', ev.target.value);
            }}
          />
          {searching && <span className="spinner" />}
        </div>
        {results.length > 0 && (
          <ul className="results">
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => pick(r)}>
                  <strong>{r.name}</strong>
                  <span>{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid2">
        <section className="field">
          <label className="field__label" htmlFor="lc">Country</label>
          <input id="lc" className="input" value={l.country ?? ''} placeholder="e.g. Japan" onChange={(ev) => set('country', ev.target.value || undefined)} />
        </section>
        <section className="field">
          <label className="field__label">Days here</label>
          <Stepper value={l.days} min={0} onChange={(v) => set('days', v)} suffix={l.days === 1 ? 'day' : 'days'} />
        </section>
      </div>
      <p className="hint">
        {remaining - (l.days - initial.days) - (l.travelDays - initial.travelDays) >= 0
          ? `${remaining - (l.days - initial.days) - (l.travelDays - initial.travelDays)} unallocated days left in the trip after this.`
          : `This goes ${-(remaining - (l.days - initial.days) - (l.travelDays - initial.travelDays))} days past the trip's end date.`}
      </p>

      {!isFirst && (
        <section className="field panel panel--inset">
          <label className="field__label">Getting here{prevName ? ` from ${prevName}` : ''}</label>
          <div className="chips">
            {TRAVEL_MODES.map((m) => (
              <button key={m.id} className={`chip ${l.travelMode === m.id ? 'on' : ''}`} onClick={() => set('travelMode', m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="row">
            <span className="small">Travel days</span>
            <Stepper value={l.travelDays} min={0} onChange={(v) => set('travelDays', v)} suffix={l.travelDays === 1 ? 'day' : 'days'} />
          </div>
          <p className="hint">0 = you travel on the morning you arrive. Use 1+ for long flights, overnight trains or road-trip days.</p>
          <input className="input" placeholder="Booking, times, notes…" value={l.travelNotes ?? ''} onChange={(ev) => set('travelNotes', ev.target.value || undefined)} />
        </section>
      )}

      <section className="field">
        <label className="field__label" htmlFor="ln">Notes</label>
        <textarea id="ln" className="input" rows={3} placeholder="Where you're staying, ideas, must-dos…" value={l.notes} onChange={(ev) => set('notes', ev.target.value)} />
      </section>
    </Sheet>
  );
}
