import type { Entry, Leg, Trip } from '../types';
import { tripDays } from './format';

/** Colours for planned locations, in itinerary order. */
export const LEG_COLORS = ['#A8662F', '#3D6B8C', '#4E7D5B', '#7A5C99', '#B08A2E', '#A04A6A', '#2F7F7A', '#8C5A3C'];
export const legColor = (i: number) => LEG_COLORS[i % LEG_COLORS.length];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** yyyy-mm-dd + n days */
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00');
  d.setDate(d.getDate() + n);
  return iso(d);
}

export interface ScheduledLeg {
  leg: Leg;
  index: number;
  color: string;
  /** First travel day (if travelDays > 0) */
  travelStart?: string;
  /** First / last day at the location (inclusive). Empty when days = 0. */
  start: string;
  end: string;
  /** 1-based trip day numbers of the stay */
  startDay: number;
  endDay: number;
}

export type PlanDay =
  | { kind: 'stay'; date: string; n: number; leg: ScheduledLeg; dayOfLeg: number }
  | { kind: 'travel'; date: string; n: number; leg: ScheduledLeg; from?: ScheduledLeg }
  | { kind: 'free'; date: string; n: number };

export interface Schedule {
  totalDays: number; // length of the trip from its dates
  allocated: number; // days given to locations + travel
  remaining: number; // negative when over-allocated
  legs: ScheduledLeg[];
  days: PlanDay[]; // one per trip day (plus any days planned past the end)
}

/**
 * Lay the planned locations out on the calendar, starting on the trip's first day.
 * Travel days come before the location they lead to; a location's days follow.
 */
export function buildSchedule(trip: Trip, legs: Leg[]): Schedule {
  const ordered = [...legs].sort((a, b) => a.order - b.order);
  const totalDays = tripDays(trip.startDate, trip.endDate);
  const days: PlanDay[] = [];
  const out: ScheduledLeg[] = [];
  let cursor = 0; // 0-based day offset from trip start
  ordered.forEach((leg, index) => {
    const sl: ScheduledLeg = { leg, index, color: legColor(index), start: '', end: '', startDay: 0, endDay: 0 };
    const travel = index > 0 ? Math.max(0, leg.travelDays || 0) : 0;
    for (let t = 0; t < travel; t++) {
      const date = addDays(trip.startDate, cursor);
      if (t === 0) sl.travelStart = date;
      days.push({ kind: 'travel', date, n: cursor + 1, leg: sl, from: out[index - 1] });
      cursor++;
    }
    const n = Math.max(0, leg.days || 0);
    if (n > 0) {
      sl.start = addDays(trip.startDate, cursor);
      sl.end = addDays(trip.startDate, cursor + n - 1);
      sl.startDay = cursor + 1;
      sl.endDay = cursor + n;
      for (let d = 0; d < n; d++) {
        days.push({ kind: 'stay', date: addDays(trip.startDate, cursor), n: cursor + 1, leg: sl, dayOfLeg: d + 1 });
        cursor++;
      }
    }
    out.push(sl);
  });
  for (let i = cursor; i < totalDays; i++) days.push({ kind: 'free', date: addDays(trip.startDate, i), n: i + 1 });
  return { totalDays, allocated: cursor, remaining: totalDays - cursor, legs: out, days };
}

/** Which planned location a stop belongs to: its explicit link, else the location scheduled on its date. */
export function legForEntry(e: Entry, schedule: Schedule): ScheduledLeg | undefined {
  if (e.legId) {
    const hit = schedule.legs.find((l) => l.leg.id === e.legId);
    if (hit) return hit;
  }
  const date = e.datetime.slice(0, 10);
  const day = schedule.days.find((d) => d.date === date && d.kind !== 'free');
  return day && day.kind !== 'free' ? day.leg : undefined;
}

export const isPlanned = (e: Entry) => e.status === 'planned';

export function fmtDuration(mins: number) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
