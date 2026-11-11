import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Entry } from '../types';
import { categoryMeta } from '../types';
import { computeStats, useTripData } from '../lib/hooks';
import { FORMATS, canvasBlob, renderStopPoster, renderTripPoster, shareOrDownload, type PosterFormat, type PosterOptions, type PosterTheme } from '../lib/poster';
import { blobUrl } from '../lib/media';
import { fmtDate } from '../lib/format';
import { groupKey, type GroupBy } from '../lib/geo';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

type Mode = 'recap' | 'stops';

const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'place';

export function SharePage() {
  const { id } = useParams();
  const data = useTripData(id);
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('recap');
  const [format, setFormat] = useState<PosterFormat>('post');
  const [theme, setTheme] = useState<PosterTheme>('ivory');
  const [showCost, setShowCost] = useState(true);
  // Places are included by default; we track the ones the user unticks so new stops show up ticked.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string>();
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const urlRef = useRef<string>();

  const opts: PosterOptions = { format, theme, showCost };
  const entries = data?.entries ?? [];
  const selected = useMemo(() => entries.filter((e) => !excluded.has(e.id)), [entries, excluded]);
  const current = selected.find((e) => e.id === previewId) ?? entries.find((e) => e.id === previewId) ?? selected[0];
  const currentIdx = current ? selected.findIndex((e) => e.id === current.id) : -1;

  const toggle = (eid: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });

  /** Places grouped by country / area, in the order they were visited. */
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = groupKey(e, groupBy);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map].map(([name, list]) => ({ name, list }));
  }, [entries, groupBy]);

  const setGroup = (list: Entry[], include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      list.forEach((e) => (include ? next.delete(e.id) : next.add(e.id)));
      return next;
    });

  /** Recap poster for a set of places. A group recap is titled with the group name. */
  const recapCanvas = async (list: Entry[] = selected, groupName?: string) => {
    const { trip, media } = data!;
    const all = list.length === entries.length;
    const ids = new Set(list.map((e) => e.id));
    const subMedia = all ? media : media.filter((m) => m.entryId && ids.has(m.entryId));
    let t = trip;
    if (groupName) {
      const days = list.map((e) => e.datetime.slice(0, 10)).sort();
      const cover = subMedia.find((m) => m.id === trip.coverMediaId) ? trip.coverMediaId : subMedia[0]?.id;
      t = { ...trip, title: groupName.split(',')[0], destination: trip.title, startDate: days[0], endDate: days[days.length - 1], rating: 0, coverMediaId: cover };
    }
    return renderTripPoster(t, list, subMedia, computeStats(list, subMedia), opts);
  };

  /** A place card. `set` = the cards it's exported alongside (for the 02 / 05 badge). */
  const placeCanvas = (e: Entry, set: Entry[]) => {
    const i = Math.max(0, set.findIndex((x) => x.id === e.id));
    return renderStopPoster(data!.trip, e, data!.mediaByEntry.get(e.id) ?? [], i, set.length, opts);
  };

  // live preview
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      let c: HTMLCanvasElement | undefined;
      if (mode === 'recap') c = await recapCanvas();
      else if (current) c = await placeCanvas(current, currentIdx >= 0 ? selected : [current]);
      if (cancelled) return;
      if (!c) return setPreview(undefined);
      const url = URL.createObjectURL(await canvasBlob(c));
      if (cancelled) return URL.revokeObjectURL(url);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreview(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, mode, format, theme, showCost, current?.id, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (label: string, make: () => Promise<{ canvas: HTMLCanvasElement; name: string }[]>) => {
    if (!data) return;
    setBusy(label);
    try {
      const items = await make();
      const blobs = await Promise.all(items.map(async ({ canvas, name }) => ({ blob: await canvasBlob(canvas), name })));
      const r = await shareOrDownload(blobs, data.trip.title);
      if (r === 'downloaded') toast(`Saved ${blobs.length} image${blobs.length > 1 ? 's' : ''}`);
    } finally {
      setBusy(null);
    }
  };

  const tripSlug = slugify(data?.trip.title ?? 'trip');
  const exportRecap = () =>
    save('recap', async () => [{ canvas: await recapCanvas(), name: `${tripSlug}-recap-${format}.png` }]);
  const exportOne = (e: Entry) =>
    save(e.id, async () => [{ canvas: await placeCanvas(e, [e]), name: `${tripSlug}-${slugify(e.title || e.placeName)}-${format}.png` }]);
  const cardsFor = async (list: Entry[], prefix = tripSlug) => {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      out.push({ canvas: await placeCanvas(e, list), name: `${prefix}-${String(i + 1).padStart(2, '0')}-${slugify(e.title || e.placeName)}-${format}.png` });
    }
    return out;
  };
  const exportSelected = () => save('selected', () => cardsFor(selected));
  const included = (list: Entry[]) => list.filter((e) => !excluded.has(e.id));
  /** Export one group: its recap (recap mode) or its place cards (cards mode). */
  const exportGroup = (name: string, list: Entry[]) =>
    save(`g:${name}`, async () =>
      mode === 'recap'
        ? [{ canvas: await recapCanvas(list, name), name: `${tripSlug}-${slugify(name)}-recap-${format}.png` }]
        : cardsFor(list, `${tripSlug}-${slugify(name)}`),
    );
  const exportRecapPerGroup = () =>
    save('per-group', async () => {
      const out = [];
      for (const g of groups) {
        const list = included(g.list);
        if (list.length) out.push({ canvas: await recapCanvas(list, g.name), name: `${tripSlug}-${slugify(g.name)}-recap-${format}.png` });
      }
      return out;
    });
  const groupNoun = groupBy === 'country' ? 'country' : 'area';
  const activeGroups = groups.filter((g) => included(g.list).length).length;

  if (!data) return <div className="page"><div className="skeleton" /></div>;
  const f = FORMATS[format];

  return (
    <div className="studio">
      <aside className="studio__panel">
        <Link to={`/trip/${data.trip.id}`} className="btn btn--ghost btn--sm"><Icon name="back" size={16} /> {data.trip.title}</Link>
        <h1 className="h2">Share studio</h1>
        <p className="muted small">Posters sized for Instagram, TikTok and Stories. On your phone, “Share” sends straight to your apps.</p>

        <label className="field__label">Design</label>
        <div className="seg">
          <button className={mode === 'recap' ? 'on' : ''} onClick={() => setMode('recap')}>Trip recap</button>
          <button className={mode === 'stops' ? 'on' : ''} onClick={() => setMode('stops')} disabled={!entries.length}>Place cards</button>
        </div>

        <label className="field__label">Format</label>
        <div className="formats">
          {(Object.keys(FORMATS) as PosterFormat[]).map((k) => (
            <button key={k} className={`format ${format === k ? 'on' : ''}`} onClick={() => setFormat(k)}>
              <span className="format__shape" style={{ aspectRatio: `${FORMATS[k].w}/${FORMATS[k].h}` }} />
              <strong>{FORMATS[k].label}</strong>
              <small>{FORMATS[k].hint}</small>
            </button>
          ))}
        </div>

        <label className="field__label">Theme</label>
        <div className="seg">
          <button className={theme === 'ivory' ? 'on' : ''} onClick={() => setTheme('ivory')}>Ivory</button>
          <button className={theme === 'noir' ? 'on' : ''} onClick={() => setTheme('noir')}>Noir</button>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} />
          <span className="toggle__ui" /> Show prices & spend
        </label>

        {entries.length > 0 && (
          <>
            <div className="picker__head">
              <label className="field__label">
                Places · {selected.length} of {entries.length}
              </label>
              <span className="row">
                <button className="link-btn" onClick={() => setExcluded(new Set())} disabled={!excluded.size}>All</button>
                <button className="link-btn" onClick={() => setExcluded(new Set(entries.map((e) => e.id)))} disabled={!selected.length}>None</button>
              </span>
            </div>
            <div className="seg seg--sm">
              <button className={groupBy === 'none' ? 'on' : ''} onClick={() => setGroupBy('none')}>No grouping</button>
              <button className={groupBy === 'country' ? 'on' : ''} onClick={() => setGroupBy('country')}>By country</button>
              <button className={groupBy === 'area' ? 'on' : ''} onClick={() => setGroupBy('area')}>By area</button>
            </div>
            <p className="muted small">
              {mode === 'recap' ? 'Ticked places appear in the recap.' : 'Tick places for the set, or export one on its own.'}
              {groupBy !== 'none' && ` Use the Export button on a ${groupNoun} to export just that ${groupNoun}.`}
            </p>
            {groups.map((g) => {
              const inc = included(g.list);
              return (
            <div key={g.name || 'all'} className="picker__group">
              {groupBy !== 'none' && (
                <div className="picker__ghead">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={inc.length === g.list.length}
                      ref={(el) => {
                        if (el) el.indeterminate = inc.length > 0 && inc.length < g.list.length;
                      }}
                      onChange={() => setGroup(g.list, inc.length !== g.list.length)}
                      aria-label={`Include all of ${g.name}`}
                    />
                  </label>
                  <strong title={g.name}>
                    {g.name.split(', ')[0]}
                    {g.name.includes(', ') && <small className="muted"> {g.name.split(', ').slice(1).join(', ')}</small>}
                  </strong>
                  <span className="muted small">{inc.length}/{g.list.length}</span>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => exportGroup(g.name, inc)}
                    disabled={!!busy || !inc.length}
                    title={mode === 'recap' ? `Recap of ${g.name}` : `Cards for ${g.name}`}
                  >
                    {busy === `g:${g.name}` ? <span className="spinner" /> : <Icon name="share" size={15} />} Export
                  </button>
                </div>
              )}
            <ul className="picker">
              {g.list.map((e) => {
                const on = !excluded.has(e.id);
                const thumb = data.mediaByEntry.get(e.id)?.[0];
                return (
                  <li key={e.id} className={`picker__row ${on ? '' : 'off'} ${mode === 'stops' && current?.id === e.id ? 'cur' : ''}`}>
                    <label className="check" title={on ? 'Included' : 'Excluded'}>
                      <input type="checkbox" checked={on} onChange={() => toggle(e.id)} aria-label={`Include ${e.title}`} />
                    </label>
                    <button
                      className="picker__main"
                      onClick={() => {
                        setPreviewId(e.id);
                        setMode('stops');
                      }}
                    >
                      <span className="picker__thumb" style={{ ['--c' as string]: categoryMeta(e.category).color }}>
                        {thumb ? <img src={blobUrl(thumb.thumb)} alt="" /> : <i className="dot" />}
                      </span>
                      <span className="picker__text">
                        <strong>{e.title || e.placeName}</strong>
                        <small>{categoryMeta(e.category).label} · {fmtDate(e.datetime)}</small>
                      </span>
                    </button>
                    <button className="icon-btn" onClick={() => exportOne(e)} disabled={!!busy} aria-label={`Export ${e.title} on its own`} title="Export this place on its own">
                      {busy === e.id ? <span className="spinner" /> : <Icon name="share" size={18} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            </div>
              );
            })}
          </>
        )}

        <div className="studio__actions">
          {mode === 'recap' ? (
            <>
              <button className="btn btn--primary btn--block" onClick={exportRecap} disabled={!!busy || !selected.length}>
                <Icon name="share" size={18} /> {busy === 'recap' ? 'Preparing…' : 'Share / save recap'}
              </button>
              {groupBy !== 'none' && activeGroups > 1 && (
                <button className="btn btn--ghost btn--block" onClick={exportRecapPerGroup} disabled={!!busy}>
                  <Icon name="download" size={18} /> {busy === 'per-group' ? 'Preparing…' : `One recap per ${groupNoun} (${activeGroups})`}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn--primary btn--block" onClick={exportSelected} disabled={!!busy || !selected.length}>
                <Icon name="download" size={18} /> {busy === 'selected' ? 'Preparing…' : `Export ${selected.length} selected place${selected.length === 1 ? '' : 's'}`}
              </button>
              {current && (
                <button className="btn btn--ghost btn--block" onClick={() => exportOne(current)} disabled={!!busy}>
                  <Icon name="share" size={18} /> Export only “{current.title || current.placeName}”
                </button>
              )}
            </>
          )}
        </div>
      </aside>
      <section className="studio__stage">
        <div className="studio__frame" style={{ aspectRatio: `${f.w}/${f.h}` }}>
          {preview ? <img src={preview} alt="Poster preview" /> : <div className="skeleton" />}
        </div>
        {mode === 'stops' && selected.length > 1 && currentIdx >= 0 && (
          <div className="studio__pager">
            <button className="icon-btn" disabled={currentIdx === 0} onClick={() => setPreviewId(selected[currentIdx - 1].id)} aria-label="Previous"><Icon name="back" /></button>
            <span className="small muted">{currentIdx + 1} / {selected.length}</span>
            <button className="icon-btn" disabled={currentIdx >= selected.length - 1} onClick={() => setPreviewId(selected[currentIdx + 1].id)} aria-label="Next"><Icon name="back" className="flip" /></button>
          </div>
        )}
        {mode === 'recap' && !selected.length && <p className="muted small">Tick at least one place to build the recap.</p>}
      </section>
    </div>
  );
}
