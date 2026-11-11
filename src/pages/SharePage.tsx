import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTripData } from '../lib/hooks';
import { FORMATS, canvasBlob, renderStopPoster, renderTripPoster, shareOrDownload, type PosterFormat, type PosterOptions, type PosterTheme } from '../lib/poster';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

type Mode = 'recap' | 'stops';

export function SharePage() {
  const { id } = useParams();
  const data = useTripData(id);
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('recap');
  const [format, setFormat] = useState<PosterFormat>('post');
  const [theme, setTheme] = useState<PosterTheme>('ivory');
  const [showCost, setShowCost] = useState(true);
  const [stopIdx, setStopIdx] = useState(0);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);

  const opts: PosterOptions = { format, theme, showCost };
  const stops = data?.entries ?? [];

  const render = async (which: 'all' | 'one') => {
    if (!data) return [];
    const { trip, entries, media, mediaByEntry, stats } = data;
    if (mode === 'recap') return [await renderTripPoster(trip, entries, media, stats, opts)];
    const idxs = which === 'all' ? entries.map((_, i) => i) : [stopIdx];
    const out: HTMLCanvasElement[] = [];
    for (const i of idxs) {
      const e = entries[i];
      if (e) out.push(await renderStopPoster(trip, e, mediaByEntry.get(e.id) ?? [], i, entries.length, opts));
    }
    return out;
  };

  // live preview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvases = await render('one');
      if (cancelled) return;
      const blobs = await Promise.all(canvases.map(canvasBlob));
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = blobs.map((b) => URL.createObjectURL(b));
      setPreviews(urls.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, mode, format, theme, showCost, stopIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportAll = async (which: 'all' | 'one') => {
    if (!data) return;
    setBusy(true);
    try {
      const canvases = await render(which);
      const slug = data.trip.title.replace(/\W+/g, '-').toLowerCase();
      const blobs = await Promise.all(canvases.map(async (c, i) => ({ blob: await canvasBlob(c), name: `${slug}-${mode}-${format}${canvases.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : ''}.png` })));
      const r = await shareOrDownload(blobs, data.trip.title);
      if (r === 'downloaded') toast(`Saved ${blobs.length} image${blobs.length > 1 ? 's' : ''}`);
    } finally {
      setBusy(false);
    }
  };

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
          <button className={mode === 'stops' ? 'on' : ''} onClick={() => setMode('stops')} disabled={!stops.length}>Location cards</button>
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

        {mode === 'stops' && stops.length > 0 && (
          <>
            <label className="field__label">Location</label>
            <select className="input" value={stopIdx} onChange={(e) => setStopIdx(+e.target.value)}>
              {stops.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title || s.placeName}</option>)}
            </select>
          </>
        )}

        <div className="studio__actions">
          <button className="btn btn--primary btn--block" onClick={() => exportAll('one')} disabled={busy}>
            <Icon name="share" size={18} /> {busy ? 'Preparing…' : 'Share / save image'}
          </button>
          {mode === 'stops' && (
            <button className="btn btn--ghost btn--block" onClick={() => exportAll('all')} disabled={busy}>
              <Icon name="download" size={18} /> Export all {stops.length} as carousel
            </button>
          )}
        </div>
      </aside>
      <section className="studio__stage">
        <div className="studio__frame" style={{ aspectRatio: `${f.w}/${f.h}` }}>
          {previews[0] ? <img src={previews[0]} alt="Poster preview" /> : <div className="skeleton" />}
        </div>
        {mode === 'stops' && stops.length > 1 && (
          <div className="studio__pager">
            <button className="icon-btn" disabled={stopIdx === 0} onClick={() => setStopIdx(stopIdx - 1)} aria-label="Previous"><Icon name="back" /></button>
            <span className="small muted">{stopIdx + 1} / {stops.length}</span>
            <button className="icon-btn" disabled={stopIdx >= stops.length - 1} onClick={() => setStopIdx(stopIdx + 1)} aria-label="Next"><Icon name="back" className="flip" /></button>
          </div>
        )}
      </section>
    </div>
  );
}
