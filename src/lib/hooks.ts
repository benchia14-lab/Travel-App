import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import type { Category, Entry, Media, Trip } from '../types';
import { routeKm } from './geo';

export interface TripData {
  trip: Trip;
  entries: Entry[];
  media: Media[];
  mediaByEntry: Map<string, Media[]>;
  stats: TripStats;
}

export interface TripStats {
  total: number;
  byCategory: Record<Category, number>;
  byDay: { day: string; total: number }[];
  places: number;
  photos: number;
  videos: number;
  km: number;
  avgRating: number;
  topRated: Entry[];
  countByCategory: Record<Category, number>;
}

export function computeStats(entries: Entry[], media: Media[]): TripStats {
  const byCategory = {} as Record<Category, number>;
  const countByCategory = {} as Record<Category, number>;
  const dayMap = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    const c = e.cost ?? 0;
    total += c;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + c;
    countByCategory[e.category] = (countByCategory[e.category] ?? 0) + 1;
    const d = e.datetime.slice(0, 10);
    dayMap.set(d, (dayMap.get(d) ?? 0) + c);
  }
  const located = entries.filter((e) => e.lat != null && e.lng != null) as (Entry & { lat: number; lng: number })[];
  const rated = entries.filter((e) => e.rating > 0);
  return {
    total,
    byCategory,
    countByCategory,
    byDay: [...dayMap].sort(([a], [b]) => a.localeCompare(b)).map(([day, t]) => ({ day, total: t })),
    places: located.length,
    photos: media.filter((m) => m.kind === 'image').length,
    videos: media.filter((m) => m.kind === 'video').length,
    km: routeKm(located),
    avgRating: rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0,
    topRated: [...rated].sort((a, b) => b.rating - a.rating).slice(0, 5),
  };
}

export function useTripData(id: string | undefined): TripData | null | undefined {
  const trip = useLiveQuery(() => (id ? db.trips.get(id) : undefined), [id], null as Trip | null | undefined);
  const entries = useLiveQuery(
    () => (id ? db.entries.where('tripId').equals(id).sortBy('datetime') : []),
    [id],
  );
  const media = useLiveQuery(() => (id ? db.media.where('tripId').equals(id).sortBy('takenAt') : []), [id]);

  return useMemo(() => {
    if (trip === null || !entries || !media) return undefined; // loading
    if (!trip) return null; // not found
    const mediaByEntry = new Map<string, Media[]>();
    for (const m of media) {
      if (!m.entryId) continue;
      const arr = mediaByEntry.get(m.entryId) ?? [];
      arr.push(m);
      mediaByEntry.set(m.entryId, arr);
    }
    return { trip, entries, media, mediaByEntry, stats: computeStats(entries, media) };
  }, [trip, entries, media]);
}
