import { jsPDF } from 'jspdf';
import type { Entry } from '../types';
import { TRAVEL_MODES, categoryMeta } from '../types';
import type { TripData } from './hooks';
import { fmtDuration, isPlanned, legForEntry } from './itinerary';
import { dateRange, fmtDate, fmtTime, money } from './format';

export interface PlanPdfOptions {
  days: boolean;
  stops: boolean;
  costs: boolean;
  notes: boolean;
}

// Built-in PDF fonts only cover Western European characters; map the rest to something printable.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function clean(s: string | undefined | null): string {
  if (!s) return '';
  let out = '';
  for (const ch of s.replace(/[   ]/g, ' ').replace(/→/g, '->')) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else {
      const base = ch.normalize('NFD')[0];
      out += base && base.codePointAt(0)! <= 0xff ? base : '?';
    }
  }
  return out;
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const INK: [number, number, number] = [22, 21, 15];
const MUTED: [number, number, number] = [122, 118, 108];
const LINE: [number, number, number] = [225, 219, 207];
const modeLabel = (m?: string) => TRAVEL_MODES.find((x) => x.id === m)?.label ?? 'Travel';
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Load the app icon once so the PDF can be built synchronously inside the tap (needed for iOS sharing). */
let logoData: string | null = null;
export async function preloadPdfAssets() {
  if (logoData) return;
  try {
    const blob = await (await fetch('./icon-192.png')).blob();
    logoData = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    logoData = null;
  }
}

/** Build the trip plan as an A4 PDF. Synchronous on purpose (see preloadPdfAssets). */
export function buildPlanPdf(data: TripData, o: PlanPdfOptions): Blob {
  const { trip, schedule, entries } = data;
  const legs = schedule.legs;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const CW = W - M * 2;
  let y = M;

  const setText = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', font: 'helvetica' | 'times' = 'helvetica', color = INK) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const ensure = (h: number, onNewPage?: () => void) => {
    if (y + h > H - 18) {
      doc.addPage();
      y = M;
      onNewPage?.();
    }
  };
  const caps = (s: string, x: number, yy: number, color = MUTED, size = 7.5, align: 'left' | 'right' = 'left') => {
    setText(size, 'bold', 'helvetica', color);
    doc.text(clean(s.toUpperCase()), x, yy, { align });
  };

  const byLeg = new Map<string, Entry[]>();
  for (const e of entries) {
    const sl = legForEntry(e, schedule);
    if (sl) byLeg.set(sl.leg.id, [...(byLeg.get(sl.leg.id) ?? []), e]);
  }
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) byDate.set(e.datetime.slice(0, 10), [...(byDate.get(e.datetime.slice(0, 10)) ?? []), e]);
  const travelDays = legs.reduce((s, l) => s + (l.index > 0 ? l.leg.travelDays : 0), 0);
  const stayDays = legs.reduce((s, l) => s + l.leg.days, 0);
  const estTotal = entries.filter(isPlanned).reduce((s, e) => s + (e.cost ?? 0), 0);

  // ── Header ──
  if (logoData) doc.addImage(logoData, 'PNG', M, y, 16, 16);
  const hx = logoData ? M + 21 : M;
  caps('Trip plan', hx, y + 3);
  setText(24, 'bold', 'times');
  const titleLines = doc.splitTextToSize(clean(trip.title), CW - (hx - M));
  doc.text(titleLines, hx, y + 12);
  y += 12 + (titleLines.length - 1) * 9;
  if (trip.destination) {
    setText(13, 'italic', 'times');
    doc.text(clean(trip.destination), hx, y + 7);
    y += 7;
  }
  setText(11, 'normal', 'times');
  doc.text(clean(`${dateRange(trip.startDate, trip.endDate)} · ${plural(schedule.totalDays, 'day')}`), hx, y + 7);
  y += 13;
  doc.setDrawColor(...LINE);
  doc.line(M, y, W - M, y);
  y += 7;

  // ── Summary ──
  const cells: [string, string][] = [
    [String(legs.length), legs.length === 1 ? 'location' : 'locations'],
    [String(stayDays), 'days at locations'],
    [String(travelDays), 'travel days'],
    [String(Math.max(0, schedule.remaining)), 'unplanned days'],
  ];
  if (o.costs && estTotal > 0) cells.push([money(estTotal, trip.currency, true), 'planned est.']);
  const cw = CW / cells.length;
  cells.forEach(([v, l], i) => {
    const x = M + i * cw;
    if (i) doc.line(x - 3, y - 2, x - 3, y + 12);
    setText(18, 'bold', 'times');
    doc.text(clean(v), x, y + 5);
    caps(l, x, y + 11, MUTED, 6.5);
  });
  y += 18;

  // ── Allocation bar ──
  const span = Math.max(schedule.totalDays, schedule.allocated, 1);
  const unit = CW / span;
  let bx = M;
  doc.setFillColor(239, 235, 226);
  doc.roundedRect(M, y, CW, 7, 2, 2, 'F');
  for (const sl of legs) {
    if (sl.index > 0 && sl.leg.travelDays > 0) {
      doc.setFillColor(...LINE);
      doc.rect(bx, y, sl.leg.travelDays * unit, 7, 'F');
      bx += sl.leg.travelDays * unit;
    }
    if (sl.leg.days > 0) {
      const w = sl.leg.days * unit;
      doc.setFillColor(...hex(sl.color));
      doc.rect(bx, y, w - 0.4, 7, 'F');
      setText(6.5, 'bold', 'helvetica', [255, 255, 255]);
      const name = clean(sl.leg.name);
      if (doc.getTextWidth(name) < w - 3) doc.text(name, bx + 1.5, y + 4.6);
      bx += w;
    }
  }
  y += 15;

  // ── Locations & durations ──
  setText(15, 'bold', 'times');
  doc.text('Locations & durations', M, y);
  y += 7;
  const cols = o.costs
    ? [{ k: '#', w: 8 }, { k: 'Location', w: 46 }, { k: 'Dates', w: 38 }, { k: 'Days', w: 12 }, { k: 'Getting there', w: 50 }, { k: 'Est.', w: CW - 154 }]
    : [{ k: '#', w: 8 }, { k: 'Location', w: 52 }, { k: 'Dates', w: 42 }, { k: 'Days', w: 12 }, { k: 'Getting there', w: CW - 114 }];
  const colX = cols.reduce<number[]>((a, _c, i) => (a.push(i ? a[i - 1] + cols[i - 1].w : M), a), []);
  const head = () => {
    cols.forEach((c, i) => {
      const right = c.k === 'Days' || c.k === 'Est.';
      caps(c.k, right ? colX[i] + c.w - (c.k === 'Days' ? 2 : 0) : colX[i], y, MUTED, 7.5, right ? 'right' : 'left');
    });
    y += 2.5;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 5;
  };
  head();

  const cellLines = (lines: { text: string; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; size?: number }[], w: number) =>
    lines.flatMap((l) => {
      setText(l.size ?? 9, l.style ?? 'normal', 'helvetica', l.color ?? INK);
      return (doc.splitTextToSize(clean(l.text), w - 2) as string[]).map((t) => ({ ...l, text: t }));
    });

  legs.forEach((sl, i) => {
    const list = byLeg.get(sl.leg.id) ?? [];
    const est = list.filter(isPlanned).reduce((s, e) => s + (e.cost ?? 0), 0);
    const loc = cellLines(
      [
        { text: sl.leg.name, style: 'bold' },
        ...(sl.leg.country ? [{ text: sl.leg.country, color: MUTED, size: 8 }] : []),
        ...(o.notes && sl.leg.notes ? [{ text: sl.leg.notes, style: 'italic' as const, size: 8 }] : []),
      ],
      cols[1].w,
    );
    const dates = cellLines(
      sl.start
        ? [{ text: dateRange(sl.start, sl.end) }, { text: `Day ${sl.startDay}${sl.endDay > sl.startDay ? `–${sl.endDay}` : ''}`, color: MUTED, size: 8 }]
        : [{ text: '—' }],
      cols[2].w,
    );
    const travel = cellLines(
      i === 0
        ? [{ text: 'Start', color: MUTED }]
        : [
            { text: `${modeLabel(sl.leg.travelMode)} from ${legs[i - 1].leg.name}` },
            { text: (sl.leg.travelDays ? plural(sl.leg.travelDays, 'travel day') : 'Same day') + (o.notes && sl.leg.travelNotes ? ` · ${sl.leg.travelNotes}` : ''), color: MUTED, size: 8 },
          ],
      cols[4].w,
    );
    const rows = Math.max(loc.length, dates.length, travel.length, 1);
    const rh = rows * 4.2 + 3;
    ensure(rh, head);
    // number dot
    doc.setFillColor(...hex(sl.color));
    doc.circle(colX[0] + 2.6, y - 1.2, 2.6, 'F');
    setText(7, 'bold', 'helvetica', [255, 255, 255]);
    const n = String(i + 1);
    doc.text(n, colX[0] + 2.6 - doc.getTextWidth(n) / 2, y);
    const draw = (lines: ReturnType<typeof cellLines>, x: number) =>
      lines.forEach((l, k) => {
        setText(l.size ?? 9, l.style ?? 'normal', 'helvetica', l.color ?? INK);
        doc.text(l.text, x, y + k * 4.2);
      });
    draw(loc, colX[1]);
    draw(dates, colX[2]);
    setText(9, 'bold');
    const d = String(sl.leg.days);
    doc.text(d, colX[3] + cols[3].w - 2 - doc.getTextWidth(d), y);
    draw(travel, colX[4]);
    if (o.costs) {
      setText(9, 'bold');
      const v = clean(est ? money(est, trip.currency) : '—');
      doc.text(v, colX[5] + cols[5].w - doc.getTextWidth(v), y);
    }
    y += rh - 3;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 5;
  });
  if (!legs.length) {
    setText(10, 'normal', 'helvetica', MUTED);
    doc.text('No locations planned yet.', M, y);
    y += 6;
  }

  // totals
  ensure(10);
  setText(9, 'bold');
  doc.text('Total', colX[1], y);
  doc.text(clean(`${plural(schedule.totalDays, 'day')} in the trip`), colX[2], y);
  const sd = String(stayDays);
  doc.text(sd, colX[3] + cols[3].w - 2 - doc.getTextWidth(sd), y);
  const tl = doc.splitTextToSize(
    clean(
      plural(travelDays, 'travel day') +
        (schedule.remaining > 0 ? ` · ${plural(schedule.remaining, 'free day')}` : '') +
        (schedule.remaining < 0 ? ` · ${-schedule.remaining} over` : ''),
    ),
    cols[4].w - 2,
  );
  doc.text(tl, colX[4], y);
  if (o.costs) {
    const v = clean(estTotal ? money(estTotal, trip.currency) : '—');
    doc.text(v, colX[5] + cols[5].w - doc.getTextWidth(v), y);
  }
  y += tl.length * 4.2 + 2;

  // ── Day by day ──
  if (o.days && schedule.days.length) {
    doc.addPage();
    y = M;
    setText(15, 'bold', 'times');
    doc.text('Day by day', M, y + 2);
    y += 10;
    for (const d of schedule.days) {
      const stops = o.stops ? byDate.get(d.date) ?? [] : [];
      const h = 6 + stops.length * 4.6;
      ensure(h + 2);
      const color = d.kind === 'free' ? LINE : hex(d.leg.color);
      doc.setFillColor(...color);
      doc.rect(M, y - 3.6, 1.2, h, 'F');
      caps(`Day ${d.n}`, M + 4, y, d.kind === 'free' ? MUTED : color, 7);
      setText(10, 'bold', 'times');
      doc.text(clean(fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })), M + 20, y);
      let where = '';
      if (d.kind === 'stay') where = `${d.leg.leg.name}  ·  day ${d.dayOfLeg} of ${d.leg.leg.days}`;
      else if (d.kind === 'travel') where = `${modeLabel(d.leg.leg.travelMode)}: ${d.from ? `${d.from.leg.name} -> ` : 'to '}${d.leg.leg.name}`;
      else where = 'Unplanned';
      setText(9, d.kind === 'free' ? 'italic' : 'normal', 'helvetica', d.kind === 'free' ? MUTED : INK);
      doc.text(clean(where), M + 48, y);
      y += 5;
      for (const e of stops) {
        setText(8.5, 'normal', 'helvetica', MUTED);
        doc.text(clean(fmtTime(e.datetime)), M + 4, y);
        doc.setFillColor(...hex(categoryMeta(e.category).color));
        doc.circle(M + 21.5, y - 1, 0.9, 'F');
        setText(8.5, 'normal');
        let title = e.title || e.placeName;
        if (isPlanned(e) && e.durationMins) title += `  ·  ~${fmtDuration(e.durationMins)}`;
        if (!isPlanned(e)) title += '  ·  done';
        const costText = o.costs && e.cost != null ? clean(money(e.cost, trip.currency)) : '';
        const maxW = CW - 26 - (costText ? doc.getTextWidth(costText) + 4 : 0);
        doc.text((doc.splitTextToSize(clean(title), maxW) as string[])[0], M + 24, y);
        if (costText) {
          setText(8.5, 'bold');
          doc.text(costText, W - M - doc.getTextWidth(costText), y);
        }
        y += 4.6;
      }
      y += 2.6;
    }
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setText(7.5, 'normal', 'helvetica', MUTED);
    doc.text(clean(`PYT · Plan Your Travel  ·  ${trip.title}`), M, H - 9);
    const pg = `${p} / ${pages}`;
    doc.text(pg, W - M - doc.getTextWidth(pg), H - 9);
  }
  return doc.output('blob');
}
