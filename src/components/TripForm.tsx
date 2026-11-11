import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, deleteTrip, uid } from '../db';
import type { Trip } from '../types';
import { CURRENCIES } from '../lib/format';
import { Sheet } from './Sheet';
import { Stars } from './Stars';
import { Icon } from './Icon';

const defaultCurrency = () => {
  try {
    return localStorage.getItem('wayfare.currency') || 'USD';
  } catch {
    return 'USD';
  }
};

export function TripForm({ trip, onClose }: { trip?: Trip; onClose: () => void }) {
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [t, setT] = useState<Trip>(
    trip ?? {
      id: uid(),
      title: '',
      destination: '',
      startDate: today,
      endDate: today,
      currency: defaultCurrency(),
      rating: 0,
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  );
  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setT((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const clean = {
      ...t,
      title: t.title.trim() || t.destination.trim() || 'Untitled trip',
      endDate: t.endDate < t.startDate ? t.startDate : t.endDate,
      updatedAt: Date.now(),
    };
    await db.trips.put(clean);
    onClose();
    if (!trip) nav(`/trip/${clean.id}?tab=plan`);
  };

  const remove = async () => {
    if (!trip || !confirm(`Delete “${trip.title}” and everything in it? This can't be undone.`)) return;
    await deleteTrip(trip.id);
    onClose();
    nav('/');
  };

  return (
    <Sheet
      title={trip ? 'Trip details' : 'New trip'}
      onClose={onClose}
      footer={
        <>
          {trip && (
            <button className="btn btn--ghost btn--danger" onClick={remove}>
              <Icon name="trash" size={18} /> Delete trip
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            {trip ? 'Save' : 'Create trip'}
          </button>
        </>
      }
    >
      <section className="field">
        <label className="field__label" htmlFor="tt">
          Trip name
        </label>
        <input id="tt" className="input input--lg" placeholder="Autumn in Kyoto" value={t.title} onChange={(e) => set('title', e.target.value)} autoFocus />
      </section>
      <section className="field">
        <label className="field__label" htmlFor="td">
          Destination
        </label>
        <input id="td" className="input" placeholder="Kyoto & Osaka, Japan" value={t.destination} onChange={(e) => set('destination', e.target.value)} />
      </section>
      <div className="grid2">
        <section className="field">
          <label className="field__label" htmlFor="sd">
            Start
          </label>
          <input id="sd" className="input" type="date" value={t.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </section>
        <section className="field">
          <label className="field__label" htmlFor="ed">
            End
          </label>
          <input id="ed" className="input" type="date" value={t.endDate} min={t.startDate} onChange={(e) => set('endDate', e.target.value)} />
        </section>
      </div>
      <div className="grid2">
        <section className="field">
          <label className="field__label" htmlFor="cur">
            Currency
          </label>
          <select id="cur" className="input" value={t.currency} onChange={(e) => set('currency', e.target.value)}>
            {[...new Set([t.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </section>
        <section className="field">
          <label className="field__label" htmlFor="bud">
            Budget (optional)
          </label>
          <input
            id="bud"
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            value={t.budget ?? ''}
            onChange={(e) => set('budget', e.target.value === '' ? undefined : +e.target.value)}
          />
        </section>
      </div>
      {trip && (
        <section className="field">
          <label className="field__label">Overall trip rating</label>
          <Stars value={t.rating} onChange={(v) => set('rating', v)} size={30} />
        </section>
      )}
      <section className="field">
        <label className="field__label" htmlFor="tn">
          Notes
        </label>
        <textarea id="tn" className="input" rows={3} value={t.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Who you travelled with, the purpose, anything to remember." />
      </section>
    </Sheet>
  );
}
