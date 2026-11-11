import Dexie, { type Table } from 'dexie';
import type { Entry, Leg, Media, Trip } from './types';

class WayfareDB extends Dexie {
  trips!: Table<Trip, string>;
  entries!: Table<Entry, string>;
  media!: Table<Media, string>;
  legs!: Table<Leg, string>;

  constructor() {
    super('wayfare');
    this.version(1).stores({
      trips: 'id, startDate, updatedAt',
      entries: 'id, tripId, category, datetime, [tripId+datetime]',
      media: 'id, tripId, entryId, takenAt',
    });
    // v2: trip planner (locations with allocated days) and stops linked to them
    this.version(2).stores({
      entries: 'id, tripId, category, datetime, legId, [tripId+datetime]',
      legs: 'id, tripId, order',
    });
  }
}

export const db = new WayfareDB();

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function deleteTrip(id: string) {
  await db.transaction('rw', [db.trips, db.entries, db.media, db.legs], async () => {
    await db.legs.where('tripId').equals(id).delete();
    await db.media.where('tripId').equals(id).delete();
    await db.entries.where('tripId').equals(id).delete();
    await db.trips.delete(id);
  });
}

export async function deleteEntry(id: string, keepMedia = false) {
  await db.transaction('rw', db.entries, db.media, async () => {
    if (keepMedia) await db.media.where('entryId').equals(id).modify({ entryId: undefined });
    else await db.media.where('entryId').equals(id).delete();
    await db.entries.delete(id);
  });
}

export async function touchTrip(id: string) {
  await db.trips.update(id, { updatedAt: Date.now() });
}
