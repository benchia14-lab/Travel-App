import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Entry, Media } from '../types';
import { blobUrl } from '../lib/media';
import { fmtDate, fmtTime } from '../lib/format';
import { db } from '../db';
import { Icon } from './Icon';

export function Lightbox({
  items,
  start,
  entries,
  coverId,
  onClose,
}: {
  items: Media[];
  start: Media;
  entries: Entry[];
  coverId?: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.max(0, items.findIndex((m) => m.id === start.id)));
  const m = items[i];
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(items.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [items.length, onClose]);
  if (!m) return null;

  return createPortal(
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lightbox__close icon-btn" onClick={onClose} aria-label="Close">
        <Icon name="close" />
      </button>
      {i > 0 && (
        <button className="lightbox__nav lightbox__nav--l icon-btn" onClick={() => setI(i - 1)} aria-label="Previous">
          <Icon name="back" />
        </button>
      )}
      {i < items.length - 1 && (
        <button className="lightbox__nav lightbox__nav--r icon-btn" onClick={() => setI(i + 1)} aria-label="Next">
          <Icon name="back" className="flip" />
        </button>
      )}
      <figure>
        {m.kind === 'video' ? (
          <video src={blobUrl(m.blob)} controls autoPlay playsInline />
        ) : (
          <img src={blobUrl(m.blob)} alt={m.fileName} />
        )}
        <figcaption>
          <span>
            {fmtDate(m.takenAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {fmtTime(m.takenAt)}
            {m.lat != null && ' · geotagged'}
          </span>
          <span className="row">
            <select
              className="input input--sm"
              value={m.entryId ?? ''}
              onChange={(e) => db.media.update(m.id, { entryId: e.target.value || undefined })}
              aria-label="Attach to stop"
            >
              <option value="">Gallery only</option>
              {entries.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.title || en.placeName}
                </option>
              ))}
            </select>
            {m.kind === 'image' && (
              <button className="btn btn--sm btn--glass" onClick={() => db.trips.update(m.tripId, { coverMediaId: m.id })} disabled={coverId === m.id}>
                {coverId === m.id ? 'Trip cover' : 'Set as cover'}
              </button>
            )}
            <button
              className="btn btn--sm btn--glass"
              onClick={async () => {
                if (!confirm('Delete this item?')) return;
                await db.media.delete(m.id);
                if (items.length <= 1) onClose();
                else setI(Math.min(i, items.length - 2));
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </span>
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
