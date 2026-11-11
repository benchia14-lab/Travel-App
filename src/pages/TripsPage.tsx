import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import type { Media, Trip } from '../types';
import { blobUrl } from '../lib/media';
import { dateRange, money, tripDays } from '../lib/format';
import { FREE_LIMITS, usePlan } from '../lib/plan';
import { TripForm } from '../components/TripForm';
import { Icon } from '../components/Icon';
import { Stars } from '../components/Stars';
import { loadSample } from '../lib/sample';
import { useToast } from '../components/Toast';

interface Card {
  trip: Trip;
  cover?: Media;
  stops: number;
  spend: number;
  memories: number;
}

export function TripsPage() {
  const [creating, setCreating] = useState(false);
  const plan = usePlan();
  const nav = useNavigate();
  const toast = useToast();
  const cards = useLiveQuery(async (): Promise<Card[]> => {
    const trips = await db.trips.orderBy('startDate').reverse().toArray();
    return Promise.all(
      trips.map(async (trip) => {
        const entries = await db.entries.where('tripId').equals(trip.id).toArray();
        const memories = await db.media.where('tripId').equals(trip.id).count();
        let cover = trip.coverMediaId ? await db.media.get(trip.coverMediaId) : undefined;
        if (!cover) cover = await db.media.where('tripId').equals(trip.id).first();
        return { trip, cover, stops: entries.length, spend: entries.reduce((s, e) => s + (e.cost ?? 0), 0), memories };
      }),
    );
  });

  const atLimit = plan.tier === 'free' && (cards?.length ?? 0) >= FREE_LIMITS.trips;
  const newTrip = () => (atLimit ? nav('/pro?reason=trips') : setCreating(true));

  const totals = cards?.reduce(
    (a, c) => ({ trips: a.trips + 1, days: a.days + tripDays(c.trip.startDate, c.trip.endDate), stops: a.stops + c.stops, memories: a.memories + c.memories }),
    { trips: 0, days: 0, stops: 0, memories: 0 },
  );

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Your journeys</p>
          <h1 className="display">Every place, beautifully kept.</h1>
        </div>
        <button className="btn btn--primary" onClick={newTrip}>
          <Icon name="plus" size={18} /> New trip
        </button>
      </header>

      {totals && totals.trips > 0 && (
        <div className="kpis">
          <div>
            <strong>{totals.trips}</strong>
            <span>trips</span>
          </div>
          <div>
            <strong>{totals.days}</strong>
            <span>days away</span>
          </div>
          <div>
            <strong>{totals.stops}</strong>
            <span>stops logged</span>
          </div>
          <div>
            <strong>{totals.memories}</strong>
            <span>memories</span>
          </div>
        </div>
      )}

      {cards && cards.length === 0 && (
        <div className="empty">
          <div className="empty__art">
            <Icon name="route" size={40} />
          </div>
          <h2>Start your first journey</h2>
          <p>Create a trip, then snap photos as you go — Wayfare pins them on the map, logs meals and costs, and turns it all into a printable journal and shareable posters.</p>
          <div className="row">
            <button className="btn btn--primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> Create a trip
            </button>
            <button
              className="btn btn--ghost"
              onClick={async () => {
                const id = await loadSample();
                toast('Sample trip loaded');
                nav(`/trip/${id}`);
              }}
            >
              Explore a sample trip
            </button>
          </div>
        </div>
      )}

      <div className="trip-grid">
        {cards?.map(({ trip, cover, stops, spend, memories }) => (
          <Link key={trip.id} to={`/trip/${trip.id}`} className="trip-card">
            <div className="trip-card__img">
              {cover ? <img src={blobUrl(cover.kind === 'image' ? cover.thumb : cover.thumb)} alt="" /> : <div className="trip-card__ph"><Icon name="globe" size={32} /></div>}
              <span className="trip-card__days">{tripDays(trip.startDate, trip.endDate)} days</span>
            </div>
            <div className="trip-card__body">
              <p className="eyebrow">{dateRange(trip.startDate, trip.endDate)}</p>
              <h3>{trip.title}</h3>
              <p className="muted">{trip.destination}</p>
              <div className="trip-card__meta">
                <span>{stops} stops</span>
                <span>{memories} memories</span>
                {spend > 0 && <span>{money(spend, trip.currency, true)}</span>}
                {trip.rating > 0 && <Stars value={trip.rating} size={13} />}
              </div>
            </div>
          </Link>
        ))}
        {cards && cards.length > 0 && (
          <button className="trip-card trip-card--new" onClick={newTrip}>
            <Icon name={atLimit ? 'lock' : 'plus'} size={28} />
            <span>{atLimit ? `Free plan includes ${FREE_LIMITS.trips} trips — upgrade for unlimited` : 'Plan a new trip'}</span>
          </button>
        )}
      </div>
      {creating && <TripForm onClose={() => setCreating(false)} />}
    </div>
  );
}
