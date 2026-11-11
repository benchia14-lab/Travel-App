import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Entry } from '../types';
import { categoryMeta } from '../types';
import { useTripData } from '../lib/hooks';
import { fmtDuration, isPlanned, legForEntry } from '../lib/itinerary';
import { dateRange, fmtDate, fmtTime, money } from '../lib/format';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Layout';
import { modeLabel } from '../components/PlanView';
import { shareOrDownload } from '../lib/poster';
import { useToast } from '../components/Toast';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Printable trip plan: every location with its dates and duration, travel between them, and the day-by-day. */
export function PlanPrintPage() {
  const { id } = useParams();
  const data = useTripData(id);
  const [opts, setOpts] = useState({ days: true, stops: true, costs: true, notes: true });
  const toggle = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Load the PDF builder (and the logo) when the screen opens, so the file can be made instantly on tap.
  const pdf = useRef<typeof import('../lib/planPdf') | null>(null);
  useEffect(() => {
    import('../lib/planPdf').then(async (m) => {
      await m.preloadPdfAssets();
      pdf.current = m;
    });
  }, []);

  const byLeg = useMemo(() => {
    const m = new Map<string, Entry[]>();
    if (!data) return m;
    for (const e of data.entries) {
      const sl = legForEntry(e, data.schedule);
      if (sl) m.set(sl.leg.id, [...(m.get(sl.leg.id) ?? []), e]);
    }
    return m;
  }, [data]);
  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    data?.entries.forEach((e) => m.set(e.datetime.slice(0, 10), [...(m.get(e.datetime.slice(0, 10)) ?? []), e]));
    return m;
  }, [data]);

  if (!data) return <div className="page"><div className="skeleton" /></div>;
  const { trip, schedule } = data;
  const legs = schedule.legs;
  const travelDays = legs.reduce((s, l) => s + (l.index > 0 ? l.leg.travelDays : 0), 0);
  const stayDays = legs.reduce((s, l) => s + l.leg.days, 0);
  const estTotal = data.entries.filter(isPlanned).reduce((s, e) => s + (e.cost ?? 0), 0);
  const labels = { days: 'Day by day', stops: 'Stops', costs: 'Costs', notes: 'Notes' } as const;

  return (
    <div className="print-wrap">
      <div className="print-toolbar no-print">
        <Link to={`/trip/${trip.id}?tab=plan`} className="btn btn--ghost"><Icon name="back" size={18} /> Back</Link>
        <div className="chips">
          {(Object.keys(opts) as (keyof typeof opts)[]).map((k) => (
            <button key={k} className={`chip ${opts[k] ? 'on' : ''}`} onClick={() => toggle(k)} disabled={k === 'stops' && !opts.days}>
              {opts[k] && <Icon name="check" size={14} />} {labels[k]}
            </button>
          ))}
        </div>
        <button
          className="btn btn--primary"
          disabled={busy}
          onClick={() => {
            // Build the file right away (inside the tap) so iPhone allows the Share sheet to open.
            if (!pdf.current) {
              toast('Still getting the PDF ready — tap again in a second.');
              return;
            }
            let blob: Blob;
            try {
              blob = pdf.current.buildPlanPdf(data, opts);
            } catch (e) {
              toast(`Couldn’t create the PDF: ${(e as Error).message}`);
              return;
            }
            const name = `${trip.title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'trip'}-plan.pdf`;
            setBusy(true);
            shareOrDownload([{ blob, name }], `${trip.title} – trip plan`)
              .then((r) => r === 'downloaded' && toast('PDF saved'))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="download" size={18} /> {busy ? 'Preparing…' : 'Save as PDF'}
        </button>
        <p className="print-hint small muted">
          On iPhone/iPad the Share sheet opens: choose <em>Save to Files</em>, AirDrop, Mail or Messages.
        </p>
      </div>

      <article className="paper paper--plan">
        <header className="pplan__head">
          <Logo size={44} />
          <div>
            <p className="eyebrow">Trip plan</p>
            <h1 className="display">{trip.title}</h1>
            {trip.destination && <p className="paper__dest">{trip.destination}</p>}
            <p className="pplan__dates">
              {dateRange(trip.startDate, trip.endDate)} · {plural(schedule.totalDays, 'day')}
            </p>
          </div>
        </header>

        <div className="kpis">
          <div><strong>{legs.length}</strong><span>{legs.length === 1 ? 'location' : 'locations'}</span></div>
          <div><strong>{stayDays}</strong><span>days at locations</span></div>
          <div><strong>{travelDays}</strong><span>travel days</span></div>
          <div><strong>{Math.max(0, schedule.remaining)}</strong><span>unplanned days</span></div>
          {opts.costs && estTotal > 0 && <div><strong>{money(estTotal, trip.currency, true)}</strong><span>planned est.</span></div>}
        </div>

        {legs.length > 0 && (
          <div className="alloc alloc--print" aria-hidden>
            {legs.map((sl) => (
              <span key={sl.leg.id} className="alloc__seg-wrap" style={{ flex: (sl.index ? sl.leg.travelDays : 0) + sl.leg.days }}>
                {sl.index > 0 && sl.leg.travelDays > 0 && <span className="alloc__seg alloc__seg--travel" style={{ flex: sl.leg.travelDays }} />}
                {sl.leg.days > 0 && <span className="alloc__seg" style={{ flex: sl.leg.days, background: sl.color }}><span>{sl.leg.name}</span></span>}
              </span>
            ))}
            {schedule.remaining > 0 && <span className="alloc__seg alloc__seg--free" style={{ flex: schedule.remaining }} />}
          </div>
        )}

        <h2 className="h2 pplan__h">Locations & durations</h2>
        {legs.length === 0 ? (
          <p className="muted">No locations planned yet.</p>
        ) : (
          <table className="table table--print pplan__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th>Dates</th>
                <th className="num">Days</th>
                <th>Getting there</th>
                {opts.costs && <th className="num">Planned est.</th>}
              </tr>
            </thead>
            <tbody>
              {legs.map((sl, i) => {
                const list = byLeg.get(sl.leg.id) ?? [];
                const est = list.filter(isPlanned).reduce((s, e) => s + (e.cost ?? 0), 0);
                return (
                  <tr key={sl.leg.id}>
                    <td><span className="num-dot" style={{ background: sl.color }}>{i + 1}</span></td>
                    <td>
                      <strong>{sl.leg.name}</strong>
                      {sl.leg.country && <div className="small muted">{sl.leg.country}</div>}
                      {opts.notes && sl.leg.notes && <div className="small pplan__note">{sl.leg.notes}</div>}
                    </td>
                    <td>
                      {sl.start ? dateRange(sl.start, sl.end) : '—'}
                      {sl.start && <div className="small muted">Day {sl.startDay}{sl.endDay > sl.startDay ? `–${sl.endDay}` : ''}</div>}
                    </td>
                    <td className="num">{sl.leg.days}</td>
                    <td>
                      {i === 0 ? (
                        <span className="muted">Start</span>
                      ) : (
                        <>
                          {modeLabel(sl.leg.travelMode)} from {legs[i - 1].leg.name}
                          <div className="small muted">
                            {sl.leg.travelDays ? plural(sl.leg.travelDays, 'travel day') : 'Same day'}
                            {opts.notes && sl.leg.travelNotes ? ` · ${sl.leg.travelNotes}` : ''}
                          </div>
                        </>
                      )}
                    </td>
                    {opts.costs && <td className="num">{est ? money(est, trip.currency) : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>Total</td>
                <td>{plural(schedule.totalDays, 'day')} in the trip</td>
                <td className="num">{stayDays}</td>
                <td>{plural(travelDays, 'travel day')}{schedule.remaining > 0 ? ` · ${plural(schedule.remaining, 'free day')}` : ''}{schedule.remaining < 0 ? ` · ${-schedule.remaining} over` : ''}</td>
                {opts.costs && <td className="num">{estTotal ? money(estTotal, trip.currency) : '—'}</td>}
              </tr>
            </tfoot>
          </table>
        )}


        {opts.days && schedule.days.length > 0 && (
          <section className="pplan__days">
            <h2 className="h2 pplan__h">Day by day</h2>
            {schedule.days.map((d) => {
              const stops = opts.stops ? byDate.get(d.date) ?? [] : [];
              const color = d.kind === 'free' ? undefined : d.leg.color;
              return (
                <div key={d.date} className={`pplan__day pplan__day--${d.kind}`} style={color ? { ['--c' as string]: color } : undefined}>
                  <div className="pplan__day-head">
                    <span className="pplan__n">Day {d.n}</span>
                    <strong>{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                    <span className="pplan__where">
                      {d.kind === 'stay' && <>{d.leg.leg.name} <span className="muted">· day {d.dayOfLeg} of {d.leg.leg.days}</span></>}
                      {d.kind === 'travel' && <>{modeLabel(d.leg.leg.travelMode)}: {d.from ? `${d.from.leg.name} → ` : 'to '}{d.leg.leg.name}</>}
                      {d.kind === 'free' && <span className="muted">Unplanned</span>}
                    </span>
                  </div>
                  {stops.length > 0 && (
                    <ul className="pplan__stops">
                      {stops.map((e) => (
                        <li key={e.id}>
                          <span className="pplan__time">{fmtTime(e.datetime)}</span>
                          <i className="dot" style={{ background: categoryMeta(e.category).color }} />
                          <span className="pplan__title">
                            {e.title || e.placeName}
                            {isPlanned(e) && e.durationMins ? <span className="muted"> · ~{fmtDuration(e.durationMins)}</span> : null}
                            {!isPlanned(e) && <span className="muted"> · done</span>}
                          </span>
                          {opts.costs && e.cost != null && <span className="pplan__cost">{money(e.cost, trip.currency)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <footer className="paper__foot"><Logo size={28} /> <span className="muted small">Plan exported {new Date().toLocaleDateString()}</span></footer>
      </article>
    </div>
  );
}
