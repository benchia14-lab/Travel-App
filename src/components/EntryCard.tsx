import type { Entry, Media } from '../types';
import { categoryMeta } from '../types';
import { fmtTime, money } from '../lib/format';
import { Stars } from './Stars';
import { Thumb } from './Thumb';
import { Icon } from './Icon';

export function EntryCard({
  entry,
  media,
  index,
  currency,
  active,
  onOpen,
  onMedia,
  onHover,
}: {
  entry: Entry;
  media: Media[];
  index?: number;
  currency: string;
  active?: boolean;
  onOpen: () => void;
  onMedia?: (m: Media) => void;
  onHover?: (on: boolean) => void;
}) {
  const meta = categoryMeta(entry.category);
  return (
    <article
      className={`entry ${active ? 'entry--active' : ''}`}
      style={{ ['--c' as string]: meta.color }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className="entry__rail">
        <span className="entry__n">{index != null ? index + 1 : <i className="dot" />}</span>
      </div>
      <div className="entry__body">
        <button className="entry__head" onClick={onOpen}>
          <div>
            <p className="entry__cat">
              <i className="dot" /> {meta.label}
              <span className="muted"> · {fmtTime(entry.datetime)}</span>
            </p>
            <h3>{entry.title || entry.placeName}</h3>
            {entry.placeName && entry.placeName !== entry.title && <p className="muted entry__place">{entry.placeName}</p>}
          </div>
          <div className="entry__right">
            {entry.cost != null && <span className="entry__cost">{money(entry.cost, currency)}</span>}
            {entry.rating > 0 && <Stars value={entry.rating} size={14} />}
          </div>
        </button>
        {media.length > 0 && (
          <div className="entry__media">
            {media.slice(0, 5).map((m, i) => (
              <Thumb key={m.id} m={m} className={i === 0 && media.length > 2 ? 'thumb--lead' : ''} onClick={() => onMedia?.(m)} />
            ))}
            {media.length > 5 && (
              <button className="entry__more" onClick={() => onMedia?.(media[5])}>
                +{media.length - 5}
              </button>
            )}
          </div>
        )}
        {entry.dishes.length > 0 && (
          <ul className="entry__dishes">
            {entry.dishes.map((d, i) => (
              <li key={i}>
                <span>{d.name}</span>
                {d.rating ? <Stars value={d.rating} size={11} /> : null}
                {d.price != null && <span className="muted">{money(d.price, currency)}</span>}
              </li>
            ))}
          </ul>
        )}
        {entry.notes && <p className="entry__notes">{entry.notes}</p>}
        {(entry.tags.length > 0 || entry.wouldReturn) && (
          <div className="entry__tags">
            {entry.wouldReturn && (
              <span className="tag tag--accent">
                <Icon name="check" size={12} /> Would return
              </span>
            )}
            {entry.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
