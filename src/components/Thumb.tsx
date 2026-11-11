import type { Media } from '../types';
import { blobUrl } from '../lib/media';
import { Icon } from './Icon';

export function Thumb({ m, className = '', onClick }: { m?: Media; className?: string; onClick?: () => void }) {
  if (!m) return <div className={`thumb thumb--empty ${className}`} />;
  return (
    <div className={`thumb ${className}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <img src={blobUrl(m.thumb)} alt={m.fileName} loading="lazy" draggable={false} />
      {m.kind === 'video' && (
        <span className="thumb__play">
          <Icon name="play" size={14} />
        </span>
      )}
    </div>
  );
}
