export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`stepper stepper--${size}`}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="One less">
        −
      </button>
      <span className="stepper__v">
        <strong>{value}</strong>
        {suffix && <small>{suffix}</small>}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="One more">
        +
      </button>
    </span>
  );
}
