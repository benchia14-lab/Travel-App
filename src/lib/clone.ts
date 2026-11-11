import { db, uid } from '../db';
import type { Entry, Leg, Trip } from '../types';
import { addDays } from './itinerary';

export type CloneStops = 'none' | 'planned' | 'all';

export interface CloneOptions {
  title: string;
  startDate: string; // yyyy-mm-dd
  stops: CloneStops;
}

const dayDiff = (a: string, b: string) => Math.round((+new Date(b + 'T12:00') - +new Date(a + 'T12:00')) / 864e5);

/** Move a local "yyyy-mm-ddThh:mm" by whole days, keeping the time of day. */
function shiftDateTime(dt: string, days: number) {
  if (!dt || days === 0) return dt;
  return addDays(dt.slice(0, 10), days) + dt.slice(10);
}

/**
 * Copy a trip's plan into a new trip: its locations (days, travel, notes) and optionally its stops,
 * all moved to the new start date. Copied stops become "planned"; photos, ratings and spend aren't copied.
 * Returns the new trip's id.
 */
export async function cloneTrip(sourceId: string, opts: CloneOptions): Promise<string> {
  const src = await db.trips.get(sourceId);
  if (!src) throw new Error('Trip not found');
  const [legs, entries] = await Promise.all([
    db.legs.where('tripId').equals(sourceId).sortBy('order'),
    db.entries.where('tripId').equals(sourceId).sortBy('datetime'),
  ]);

  const now = Date.now();
  const shift = dayDiff(src.startDate, opts.startDate);
  const length = dayDiff(src.startDate, src.endDate || src.startDate);
  const tripId = uid();

  const trip: Trip = {
    id: tripId,
    title: opts.title.trim() || `${src.title} (copy)`,
    destination: src.destination,
    startDate: opts.startDate,
    endDate: addDays(opts.startDate, Math.max(0, length)),
    currency: src.currency,
    budget: src.budget,
    rating: 0,
    notes: src.notes,
    createdAt: now,
    updatedAt: now,
  };

  const legIds = new Map<string, string>();
  const newLegs: Leg[] = legs.map((l) => {
    const id = uid();
    legIds.set(l.id, id);
    return { ...l, id, tripId, createdAt: now, updatedAt: now };
  });

  const keep = (e: Entry) => opts.stops === 'all' || (opts.stops === 'planned' && e.status === 'planned');
  const newEntries: Entry[] = entries.filter(keep).map((e) => ({
    ...e,
    id: uid(),
    tripId,
    datetime: shiftDateTime(e.datetime, shift),
    legId: e.legId ? legIds.get(e.legId) : undefined,
    status: 'planned',
    rating: 0,
    wouldReturn: undefined,
    dishes: e.dishes.map((d) => ({ ...d, rating: undefined })),
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction('rw', [db.trips, db.legs, db.entries], async () => {
    await db.trips.add(trip);
    if (newLegs.length) await db.legs.bulkAdd(newLegs);
    if (newEntries.length) await db.entries.bulkAdd(newEntries);
  });
  return tripId;
}
