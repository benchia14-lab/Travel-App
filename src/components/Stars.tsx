export function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <span className={`stars ${onChange ? 'stars--edit' : ''}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`sg${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--star)" />
                <stop offset={`${fill * 100}%`} stopColor="var(--star-off)" />
              </linearGradient>
            </defs>
            <path
              d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9L12 2.8Z"
              fill={`url(#sg${i}-${Math.round(fill * 100)})`}
            />
          </svg>
        );
        return onChange ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={Math.round(value) === i}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            onClick={() => onChange(value === i ? i - 0.5 : i)}
          >
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        );
      })}
    </span>
  );
}
