import { useEffect, useMemo, useRef, useState } from 'react';
import { db, deleteEntry, touchTrip, uid } from '../db';
import type { Category, Dish, Entry, Media, Trip } from '../types';
import { CATEGORIES } from '../types';
import { currentPosition, reverseGeocode, searchPlaces, type Place } from '../lib/geo';
import { ingestFile, toLocalISO } from '../lib/media';
import { Icon } from './Icon';
import { Stars } from './Stars';
import { Thumb } from './Thumb';
import { TripMap } from './TripMap';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

export function blankEntry(trip: Trip, category: Category = 'food'): Entry {
  const now = new Date();
  const inTrip = trip.startDate && toLocalISO(now).slice(0, 10) >= trip.startDate && toLocalISO(now).slice(0, 10) <= (trip.endDate || trip.startDate);
  return {
    id: uid(),
    tripId: trip.id,
    category,
    title: '',
    placeName: '',
    datetime: inTrip || !trip.startDate ? toLocalISO(now) : `${trip.startDate}T12:00`,
    rating: 0,
    notes: '',
    dishes: [],
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function EntrySheet({
  trip,
  entry: initial,
  isNew,
  media,
  onClose,
}: {
  trip: Trip;
  entry: Entry;
  isNew: boolean;
  media: Media[];
  onClose: () => void;
}) {
  const [e, setE] = useState<Entry>(initial);
  const [q, setQ] = useState(initial.placeName);
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const [pickOnMap, setPickOnMap] = useState(false);
  const [pending, setPending] = useState<Media[]>([]); // uploaded during this edit
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setE((p) => ({ ...p, [k]: v }));

  const allMedia = useMemo(() => {
    const ids = new Set(media.map((m) => m.id));
    return [...media, ...pending.filter((m) => !ids.has(m.id))];
  }, [media, pending]);

  // place search (debounced)
  useEffect(() => {
    if (!q || q === e.placeName) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(q, e.lat != null ? { lat: e.lat, lng: e.lng! } : undefined));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPlace = (p: Place) => {
    setE((prev) => ({
      ...prev,
      placeName: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      area: p.area ?? prev.area,
      country: p.country ?? prev.country,
      title: prev.title || p.name,
    }));
    setQ(p.name);
    setResults([]);
  };

  const setCoords = async (lat: number, lng: number, label: string) => {
    setE((p) => ({ ...p, lat, lng }));
    setBusy(label);
    const place = await reverseGeocode({ lat, lng });
    setBusy('');
    if (place) applyPlace(place);
  };

  const useMyLocation = async () => {
    try {
      setBusy('Locating…');
      const p = await currentPosition();
      await setCoords(p.lat, p.lng, 'Finding place…');
    } catch {
      setBusy('');
      toast('Location permission was denied or unavailable.');
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setBusy(`Processing ${list.length} file${list.length > 1 ? 's' : ''}…`);
    const added: Media[] = [];
    for (const f of list) {
      try {
        added.push(await ingestFile(f, trip.id, e.id));
      } catch {
        toast(`Couldn't read ${f.name}`);
      }
    }
    setPending((p) => [...p, ...added]);
    setBusy('');
    // Auto-fill location/time from the first geotagged photo
    const geo = added.find((m) => m.lat != null);
    if (geo && e.lat == null) {
      if (geo.takenAt) set('datetime', geo.takenAt);
      await setCoords(geo.lat!, geo.lng!, 'Reading photo location…');
      toast('Location set from photo GPS');
    } else if (added[0]?.takenAt && isNew && !e.title) set('datetime', added[0].takenAt);
  };

  const removeMedia = async (m: Media) => {
    await db.media.delete(m.id);
    setPending((p) => p.filter((x) => x.id !== m.id));
  };

  const save = async () => {
    const cleaned: Entry = {
      ...e,
      title: e.title.trim() || e.placeName || CATEGORIES.find((c) => c.id === e.category)!.label,
      dishes: e.dishes.filter((d) => d.name.trim()),
      updatedAt: Date.now(),
    };
    await db.entries.put(cleaned);
    if (!trip.coverMediaId && allMedia[0]) await db.trips.update(trip.id, { coverMediaId: allMedia[0].id });
    await touchTrip(trip.id);
    onClose();
  };

  const cancel = async () => {
    // discard media uploaded during a cancelled new-entry session
    if (isNew && pending.length) await db.media.bulkDelete(pending.map((m) => m.id));
    onClose();
  };

  const remove = async () => {
    if (!confirm('Delete this stop and its photos?')) return;
    await deleteEntry(e.id);
    onClose();
  };

  const setDish = (i: number, patch: Partial<Dish>) =>
    set('dishes', e.dishes.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const dishTotal = e.dishes.reduce((s, d) => s + (d.price ?? 0), 0);
  const isFood = e.category === 'food';

  return (
    <Sheet
      title={isNew ? 'New stop' : 'Edit stop'}
      onClose={cancel}
      footer={
        <>
          {!isNew && (
            <button className="btn btn--ghost btn--danger" onClick={remove}>
              <Icon name="trash" size={18} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={!!busy && busy.startsWith('Processing')}>
            {isNew ? 'Add stop' : 'Save'}
          </button>
        </>
      }
    >
      <div className="seg seg--scroll" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={e.category === c.id}
            className={e.category === c.id ? 'on' : ''}
            style={{ ['--c' as string]: c.color }}
            onClick={() => set('category', c.id)}
          >
            <i className="dot" /> {c.label}
          </button>
        ))}
      </div>

      {/* Media first — snapping a photo is the fastest capture */}
      <section className="field">
        <label className="field__label">Photos & videos</label>
        <div className="media-row">
          {allMedia.map((m) => (
            <div key={m.id} className="media-row__item">
              <Thumb m={m} />
              <button className="media-row__x" aria-label="Remove" onClick={() => removeMedia(m)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <button className="media-row__add" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={22} />
            <span>Add</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(ev) => {
            onFiles(ev.target.files);
            ev.target.value = '';
          }}
        />
        <p className="hint">Location and time are read automatically from geotagged photos.</p>
      </section>

      <section className="field">
        <label className="field__label" htmlFor="t">
          Name
        </label>
        <input
          id="t"
          className="input input--lg"
          placeholder={isFood ? 'e.g. Omakase at Sushi Saito' : 'What did you do?'}
          value={e.title}
          onChange={(ev) => set('title', ev.target.value)}
        />
      </section>

      <section className="field">
        <label className="field__label">Location</label>
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="Search a place or address" value={q} onChange={(ev) => setQ(ev.target.value)} />
          {searching && <span className="spinner" />}
        </div>
        {results.length > 0 && (
          <ul className="results">
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => applyPlace(r)}>
                  <strong>{r.name}</strong>
                  <span>{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chips">
          <button className="chip" onClick={useMyLocation}>
            <Icon name="locate" size={16} /> Current location
          </button>
          <button className={`chip ${pickOnMap ? 'on' : ''}`} onClick={() => setPickOnMap((v) => !v)}>
            <Icon name="pin" size={16} /> Pick on map
          </button>
          {e.lat != null && (
            <span className="chip chip--static">
              {e.lat.toFixed(4)}, {e.lng!.toFixed(4)}
            </span>
          )}
          {busy && <span className="chip chip--static">{busy}</span>}
        </div>
        {(pickOnMap || e.lat != null) && (
          <TripMap
            className="map--pick"
            entries={e.lat != null ? [e] : []}
            showRoute={false}
            onPick={pickOnMap ? (lat, lng) => setCoords(lat, lng, 'Finding place…') : undefined}
          />
        )}
      </section>

      <div className="grid2">
        <section className="field">
          <label className="field__label" htmlFor="area">
            Area / city
          </label>
          <input id="area" className="input" placeholder="e.g. Sintra" value={e.area ?? ''} onChange={(ev) => set('area', ev.target.value || undefined)} />
        </section>
        <section className="field">
          <label className="field__label" htmlFor="country">
            Country
          </label>
          <input id="country" className="input" placeholder="e.g. Portugal" value={e.country ?? ''} onChange={(ev) => set('country', ev.target.value || undefined)} />
        </section>
      </div>

      <div className="grid2">
        <section className="field">
          <label className="field__label" htmlFor="dt">
            When
          </label>
          <input id="dt" className="input" type="datetime-local" value={e.datetime} onChange={(ev) => set('datetime', ev.target.value)} />
        </section>
        <section className="field">
          <label className="field__label" htmlFor="cost">
            {isFood ? 'Bill total' : 'Cost'} ({trip.currency})
          </label>
          <input
            id="cost"
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder={isFood && dishTotal ? String(dishTotal) : '0.00'}
            value={e.cost ?? ''}
            onChange={(ev) => set('cost', ev.target.value === '' ? undefined : +ev.target.value)}
          />
        </section>
      </div>

      <section className="field field--row">
        <div>
          <label className="field__label">Rating</label>
          <Stars value={e.rating} onChange={(v) => set('rating', v)} size={30} />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={!!e.wouldReturn} onChange={(ev) => set('wouldReturn', ev.target.checked)} />
          <span className="toggle__ui" />
          Would go back
        </label>
      </section>

      {isFood && (
        <section className="field">
          <label className="field__label">Food log — what you ordered</label>
          <div className="dishes">
            {e.dishes.map((d, i) => (
              <div key={i} className="dish">
                <input className="input" placeholder="Dish or drink" value={d.name} onChange={(ev) => setDish(i, { name: ev.target.value })} />
                <input
                  className="input dish__price"
                  type="number"
                  inputMode="decimal"
                  placeholder="Price"
                  value={d.price ?? ''}
                  onChange={(ev) => setDish(i, { price: ev.target.value === '' ? undefined : +ev.target.value })}
                />
                <Stars value={d.rating ?? 0} onChange={(v) => setDish(i, { rating: v })} size={18} />
                <button className="icon-btn" aria-label="Remove dish" onClick={() => set('dishes', e.dishes.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <button className="btn btn--ghost btn--sm" onClick={() => set('dishes', [...e.dishes, { name: '' }])}>
              <Icon name="plus" size={16} /> Add dish
            </button>
            {dishTotal > 0 && e.cost == null && (
              <button className="btn btn--ghost btn--sm" onClick={() => set('cost', dishTotal)}>
                Use dish total as bill
              </button>
            )}
          </div>
        </section>
      )}

      <section className="field">
        <label className="field__label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          className="input"
          rows={3}
          placeholder={isFood ? 'Atmosphere, standout dish, tips…' : 'What made it memorable?'}
          value={e.notes}
          onChange={(ev) => set('notes', ev.target.value)}
        />
      </section>

      <section className="field">
        <label className="field__label" htmlFor="tags">
          Tags
        </label>
        <input
          id="tags"
          className="input"
          placeholder="michelin, rooftop, hidden gem"
          value={e.tags.join(', ')}
          onChange={(ev) => set('tags', ev.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </section>
    </Sheet>
  );
}
