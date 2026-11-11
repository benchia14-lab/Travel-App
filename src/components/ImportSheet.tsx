import { useRef, useState } from 'react';
import { db, touchTrip, uid } from '../db';
import type { Category, Entry, Media, Trip } from '../types';
import { CATEGORIES } from '../types';
import { clusterByPlace, reverseGeocode } from '../lib/geo';
import { ingestFile } from '../lib/media';
import { fmtDate, fmtTime } from '../lib/format';
import { Sheet } from './Sheet';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { useToast } from './Toast';

interface Group {
  key: string;
  items: Media[];
  category: Category;
  include: boolean;
  name?: string;
  area?: string;
  country?: string;
}

/**
 * Bulk photo import: reads GPS + timestamps from each photo, groups photos taken
 * at the same place and time into stops, and reverse-geocodes each stop.
 */
export function ImportSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loose, setLoose] = useState<Media[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const out: Media[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, label: 'Reading photos' });
      try {
        out.push(await ingestFile(list[i], trip.id));
      } catch {
        /* skip unreadable */
      }
    }
    const geo = out.filter((m) => m.lat != null);
    const clusters = clusterByPlace(geo);
    const gs: Group[] = clusters.map((items) => ({ key: items[0].id, items, category: 'moment', include: true }));
    setGroups(gs);
    setLoose(out.filter((m) => m.lat == null));
    // reverse geocode each cluster (Nominatim asks for ≤1 req/s)
    for (let i = 0; i < gs.length; i++) {
      setProgress({ done: i, total: gs.length, label: 'Finding places' });
      const m = gs[i].items[0];
      const p = await reverseGeocode({ lat: m.lat!, lng: m.lng! });
      setGroups((prev) => prev.map((g) => (g.key === gs[i].key ? { ...g, name: p?.name ?? '', area: p?.area, country: p?.country } : g)));
      if (i < gs.length - 1) await new Promise((r) => setTimeout(r, 1100));
    }
    setProgress(null);
  };

  const commit = async () => {
    const entries: Entry[] = [];
    for (const g of groups.filter((x) => x.include)) {
      const first = g.items[0];
      const id = uid();
      entries.push({
        id,
        tripId: trip.id,
        category: g.category,
        title: g.name || 'Photo stop',
        placeName: g.name || '',
        area: g.area,
        country: g.country,
        lat: first.lat,
        lng: first.lng,
        datetime: first.takenAt ?? `${trip.startDate}T12:00`,
        rating: 0,
        notes: '',
        dishes: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await db.media.bulkUpdate(g.items.map((m) => ({ key: m.id, changes: { entryId: id } })));
    }
    await db.entries.bulkAdd(entries);
    // stretch the trip's dates to cover the imported photos
    const days = entries.map((e) => e.datetime.slice(0, 10)).sort();
    if (days.length) {
      const startDate = !trip.startDate || days[0] < trip.startDate ? days[0] : trip.startDate;
      const last = days[days.length - 1];
      const endDate = !trip.endDate || last > trip.endDate ? last : trip.endDate;
      await db.trips.update(trip.id, { startDate, endDate });
    }
    const firstMedia = groups[0]?.items[0] ?? loose[0];
    if (!trip.coverMediaId && firstMedia) await db.trips.update(trip.id, { coverMediaId: firstMedia.id });
    await touchTrip(trip.id);
    toast(`Added ${entries.length} stop${entries.length === 1 ? '' : 's'}`);
    onClose();
  };

  const busy = !!progress;
  const total = groups.length + loose.length;

  return (
    <Sheet
      title="Import from photos"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="hint">
            {groups.length ? `${groups.filter((g) => g.include).length} stops · ${loose.length} without location (kept in gallery)` : ''}
          </span>
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Done
          </button>
          <button className="btn btn--primary" disabled={busy || !groups.some((g) => g.include)} onClick={commit}>
            Create stops
          </button>
        </>
      }
    >
      {!total && !busy && (
        <button className="dropzone" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={36} />
          <strong>Select photos from your trip</strong>
          <span>We'll read each photo's GPS and time, group them into stops, and pin them on your map.</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {progress && (
        <div className="progress">
          <div className="progress__bar" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          <span>
            {progress.label}… {progress.done}/{progress.total}
          </span>
        </div>
      )}
      <div className="import-list">
        {groups.map((g) => (
          <div key={g.key} className={`import-item ${g.include ? '' : 'off'}`}>
            <label className="check">
              <input
                type="checkbox"
                checked={g.include}
                onChange={(e) => setGroups((p) => p.map((x) => (x.key === g.key ? { ...x, include: e.target.checked } : x)))}
              />
            </label>
            <div className="import-item__thumbs">
              {g.items.slice(0, 4).map((m) => (
                <Thumb key={m.id} m={m} />
              ))}
              {g.items.length > 4 && <span className="more">+{g.items.length - 4}</span>}
            </div>
            <div className="import-item__meta">
              <strong>{g.name === undefined ? 'Locating…' : g.name || 'Unnamed place'}</strong>
              <span>
                {fmtDate(g.items[0].takenAt, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(g.items[0].takenAt)} · {g.items.length} item
                {g.items.length > 1 ? 's' : ''}
              </span>
            </div>
            <select
              className="input input--sm"
              value={g.category}
              onChange={(e) => setGroups((p) => p.map((x) => (x.key === g.key ? { ...x, category: e.target.value as Category } : x)))}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {loose.length > 0 && !busy && (
        <p className="hint">
          {loose.length} item{loose.length > 1 ? 's have' : ' has'} no GPS data. They're saved to the trip gallery — attach them to a stop anytime. On iPhone, choose
          “Options → Location” when sharing to keep GPS.
        </p>
      )}
    </Sheet>
  );
}
