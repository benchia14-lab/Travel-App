import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TripData } from '../lib/hooks';
import { cloneTrip, type CloneStops } from '../lib/clone';
import { addDays, isPlanned } from '../lib/itinerary';
import { dateRange } from '../lib/format';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Make a new trip from this trip's plan, on new dates. */
export function CloneSheet({ data, onClose }: { data: TripData; onClose: () => void }) {
  const { trip, legs, entries, schedule } = data;
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState(`${trip.title} (copy)`);
  const [start, setStart] = useState(trip.startDate);
  const plannedCount = entries.filter(isPlanned).length;
  const [stops, setStops] = useState<CloneStops>(plannedCount ? 'planned' : 'none');
  const [busy, setBusy] = useState(false);
  const end = addDays(start || trip.startDate, schedule.totalDays - 1);

  const choices: { id: CloneStops; label: string; hint: string }[] = [
    { id: 'none', label: 'Locations only', hint: 'Just the route and the days at each place.' },
    { id: 'planned', label: 'Locations + planned stops', hint: plannedCount === 1 ? '1 planned stop with its time, estimate and notes.' : `${plannedCount} planned stops with their times, estimates and notes.` },
    { id: 'all', label: 'Locations + every stop', hint: `All ${entries.length} stop${entries.length === 1 ? '' : 's'}, copied as planned. Handy for repeating a trip.` },
  ];

  const go = async () => {
    setBusy(true);
    try {
      const id = await cloneTrip(trip.id, { title, startDate: start || trip.startDate, stops });
      toast('Plan cloned');
      onClose();
      nav(`/trip/${id}?tab=plan`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Clone this plan"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={go} disabled={busy || !start}>
            {busy ? 'Cloning…' : 'Create copy'}
          </button>
        </>
      }
    >
      <p className="muted small">
        Makes a new trip with the same {legs.length} location{legs.length === 1 ? '' : 's'}, days and travel. Photos, ratings and actual spend aren’t copied.
      </p>
      <section className="field">
        <label className="field__label" htmlFor="ct">New trip name</label>
        <input id="ct" className="input input--lg" value={title} onChange={(e) => setTitle(e.target.value)} />
      </section>
      <section className="field">
        <label className="field__label" htmlFor="cs">Start date</label>
        <input id="cs" className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <p className="hint">
          {schedule.totalDays} days · {dateRange(start || trip.startDate, end)}. Every date in the plan moves with it.
        </p>
      </section>
      <section className="field">
        <label className="field__label">What to copy</label>
        <div className="choice-list" role="radiogroup">
          {choices.map((c) => (
            <label key={c.id} className={`choice ${stops === c.id ? 'on' : ''} ${c.id !== 'none' && (c.id === 'planned' ? !plannedCount : !entries.length) ? 'off' : ''}`}>
              <input
                type="radio"
                name="clone-stops"
                checked={stops === c.id}
                disabled={c.id === 'planned' ? !plannedCount : c.id === 'all' ? !entries.length : false}
                onChange={() => setStops(c.id)}
              />
              <span>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
    </Sheet>
  );
}
