import type { Entry, Media, Trip } from '../types';
import { categoryMeta } from '../types';
import type { TripStats } from './hooks';
import { dateRange, fmtDate, money, tripDays } from './format';

export type PosterFormat = 'post' | 'story' | 'square';
export type PosterTheme = 'ivory' | 'noir';

export const FORMATS: Record<PosterFormat, { w: number; h: number; label: string; hint: string }> = {
  post: { w: 1080, h: 1350, label: 'Post 4:5', hint: 'Instagram feed' },
  story: { w: 1080, h: 1920, label: 'Story 9:16', hint: 'Stories · Reels · TikTok' },
  square: { w: 1080, h: 1080, label: 'Square 1:1', hint: 'Feed · carousel' },
};

export interface PosterOptions {
  format: PosterFormat;
  theme: PosterTheme;
  showCost: boolean;
}

const THEMES = {
  ivory: { bg: '#F4F1EA', ink: '#16150F', muted: '#77736A', line: '#D9D3C6', accent: '#A8662F', card: '#FFFFFF' },
  noir: { bg: '#121210', ink: '#F3EFE6', muted: '#9C978C', line: '#2E2D29', accent: '#D49A5C', card: '#1C1B18' },
};

const SERIF = '"Fraunces", "Iowan Old Style", Georgia, serif';
const SANS = '"Inter", system-ui, -apple-system, sans-serif';

export async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.allSettled([
    document.fonts.load(`500 80px "Fraunces"`),
    document.fonts.load(`italic 400 40px "Fraunces"`),
    document.fonts.load(`500 28px "Inter"`),
    document.fonts.load(`600 28px "Inter"`),
  ]);
}

async function bitmap(blob?: Blob): Promise<ImageBitmap | null> {
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number, r = 0) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: (s: number) => string, start: number, min: number) {
  let s = start;
  ctx.font = font(s);
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 2;
    ctx.font = font(s);
  }
  return s;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (lines === maxLines - 1) {
        let l = line;
        while (ctx.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1);
        ctx.fillText(l + '…', x, y + lines * lh);
        return lines + 1;
      }
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = words[i];
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + lines * lh);
  return lines + 1;
}

function stars(ctx: CanvasRenderingContext2D, rating: number, x: number, y: number, size: number, on: string, off: string) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * size * 1.25 + size / 2;
    const cy = y + size / 2;
    const fill = Math.max(0, Math.min(1, rating - i));
    ctx.save();
    starPath(ctx, cx, cy, size / 2);
    ctx.fillStyle = off;
    ctx.fill();
    if (fill > 0) {
      ctx.clip();
      ctx.fillStyle = on;
      ctx.fillRect(cx - size / 2, cy - size / 2, size * fill, size);
    }
    ctx.restore();
  }
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  entries: Entry[],
  x: number,
  y: number,
  w: number,
  h: number,
  t: (typeof THEMES)['ivory'],
) {
  const pts = entries.filter((e) => e.lat != null && e.lng != null);
  ctx.save();
  roundRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = t.card;
  ctx.fill();
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  // subtle grid
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  for (let gx = x + 40; gx < x + w; gx += 60) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y + 40; gy < y + h; gy += 60) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (pts.length) {
    const lats = pts.map((p) => p.lat!);
    const lngs = pts.map((p) => p.lng!);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lngs) * k;
    const maxX = Math.max(...lngs) * k;
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const pad = 70;
    const sx = (w - pad * 2) / Math.max(maxX - minX, 1e-6);
    const sy = (h - pad * 2) / Math.max(maxY - minY, 1e-6);
    const s = Math.min(sx, sy);
    const ox = x + w / 2 - ((minX + maxX) / 2) * s;
    const oy = y + h / 2 + ((minY + maxY) / 2) * s;
    const P = pts.map((p) => [ox + p.lng! * k * s, oy - p.lat! * s] as const);
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 14]);
    ctx.beginPath();
    P.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.setLineDash([]);
    P.forEach(([px, py], i) => {
      const c = categoryMeta(pts[i].category).color;
      ctx.beginPath();
      ctx.arc(px, py, i === 0 || i === P.length - 1 ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.card;
      ctx.stroke();
    });
  } else {
    ctx.fillStyle = t.muted;
    ctx.font = `500 26px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('Add locations to draw your route', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

function footer(ctx: CanvasRenderingContext2D, W: number, H: number, t: (typeof THEMES)['ivory']) {
  ctx.fillStyle = t.muted;
  ctx.font = `600 22px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.letterSpacing = '4px';
  ctx.fillText('PYT · PLAN YOUR TRAVEL', W - 72, H - 56);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `600 22px ${SANS}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function newCanvas(o: PosterOptions) {
  const { w, h } = FORMATS[o.format];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const t = THEMES[o.theme];
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  return { c, ctx, W: w, H: h, t };
}

function pickPhotos(media: Media[], n: number, prefer?: string) {
  const imgs = media.filter((m) => m.kind === 'image' || m.thumb.size > 200);
  const sorted = [...imgs].sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : 0));
  return sorted.slice(0, n);
}

/** Trip recap poster: cover, title, stats, mosaic and route. */
export async function renderTripPoster(
  trip: Trip,
  entries: Entry[],
  media: Media[],
  stats: TripStats,
  o: PosterOptions,
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const { c, ctx, W, H, t } = newCanvas(o);
  const M = 72;
  const photos = pickPhotos(media, 6, trip.coverMediaId);
  const bmps = await Promise.all(photos.map((p) => bitmap(p.kind === 'image' ? p.blob : p.thumb)));

  const tall = o.format === 'story';
  const sq = o.format === 'square';
  const heroH = tall ? 820 : sq ? 430 : 600;

  // hero
  if (bmps[0]) cover(ctx, bmps[0], M, M, W - M * 2, heroH, 32);
  else placeholder(ctx, M, M, W - M * 2, heroH, 32, t.line);
  // gradient over hero bottom
  const g = ctx.createLinearGradient(0, M + heroH * 0.45, 0, M + heroH);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.save();
  roundRect(ctx, M, M, W - M * 2, heroH, 32);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(M, M, W - M * 2, heroH);
  ctx.restore();

  ctx.fillStyle = '#fff';
  label(ctx, `${tripDays(trip.startDate, trip.endDate)} days · ${dateRange(trip.startDate, trip.endDate)}`, M + 44, M + heroH - 140, 'rgba(255,255,255,0.85)');
  const ts = fitText(ctx, trip.title, W - M * 2 - 88, (s) => `500 ${s}px ${SERIF}`, sq ? 84 : 96, 44);
  ctx.fillStyle = '#fff';
  ctx.font = `500 ${ts}px ${SERIF}`;
  ctx.fillText(trip.title, M + 44, M + heroH - 56);

  let y = M + heroH + 64;
  // destination + rating
  ctx.fillStyle = t.ink;
  ctx.font = `italic 400 40px ${SERIF}`;
  ctx.fillText(trip.destination || ' ', M, y + 10);
  const r = trip.rating || stats.avgRating;
  if (r > 0) stars(ctx, r, W - M - 5 * 34 * 1.25 + 8, y - 24, 34, t.accent, t.line);
  y += 56;

  // stats
  const cells: [string, string][] = [
    [String(stats.places || entries.length), 'stops'],
    [stats.km >= 1 ? `${Math.round(stats.km).toLocaleString()} km` : '—', 'travelled'],
    [String(stats.photos + stats.videos), 'memories'],
  ];
  if (o.showCost) cells.push([money(stats.total, trip.currency, true), 'spent']);
  else cells.push([String(stats.countByCategory.food ?? 0), 'meals']);
  const cw = (W - M * 2) / cells.length;
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  cells.forEach(([v, l], i) => {
    const cx = M + i * cw;
    ctx.fillStyle = t.ink;
    fitText(ctx, v, cw - 24, (s) => `500 ${s}px ${SERIF}`, 52, 30);
    ctx.fillText(v, cx, y + 76);
    label(ctx, l, cx, y + 116, t.muted);
  });
  y += 156;

  if (sq) {
    // compact: three thumbs strip
    const n = 3;
    const gap = 16;
    const tw = (W - M * 2 - gap * (n - 1)) / n;
    const th = H - y - 130;
    for (let i = 0; i < n; i++) {
      const b = bmps[i + 1];
      if (b) cover(ctx, b, M + i * (tw + gap), y, tw, th, 20);
      else placeholder(ctx, M + i * (tw + gap), y, tw, th, 20, t.line);
    }
  } else {
    // mosaic + route
    const avail = H - y - 140;
    const half = (W - M * 2 - 20) / 2;
    if (tall) {
      const mh = avail * 0.48;
      const mw = (W - M * 2 - 32) / 3;
      for (let i = 0; i < 3; i++) {
        const b = bmps[i + 1];
        if (b) cover(ctx, b, M + i * (mw + 16), y, mw, mh, 22);
        else placeholder(ctx, M + i * (mw + 16), y, mw, mh, 22, t.line);
      }
      y += mh + 24;
      drawRoute(ctx, entries, M, y, W - M * 2, avail - mh - 24, t);
    } else {
      const b1 = bmps[1];
      const b2 = bmps[2];
      const mh = (avail - 16) / 2;
      if (b1) cover(ctx, b1, M, y, half, mh, 22);
      else placeholder(ctx, M, y, half, mh, 22, t.line);
      if (b2) cover(ctx, b2, M, y + mh + 16, half, mh, 22);
      else placeholder(ctx, M, y + mh + 16, half, mh, 22, t.line);
      drawRoute(ctx, entries, M + half + 20, y, half, avail, t);
    }
  }

  // highlights line
  ctx.fillStyle = t.muted;
  ctx.font = `500 24px ${SANS}`;
  const best = stats.topRated[0];
  if (best) wrap(ctx, `Highlight · ${best.title || best.placeName}`, M, H - 56, W - M * 2 - 300, 30, 1);
  footer(ctx, W, H, t);
  bmps.forEach((b) => b?.close());
  return c;
}

/** One stop: photo, category, name, rating, cost, note. */
export async function renderStopPoster(
  trip: Trip,
  entry: Entry,
  media: Media[],
  index: number,
  total: number,
  o: PosterOptions,
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const { c, ctx, W, H, t } = newCanvas(o);
  const M = 72;
  const photos = pickPhotos(media, 3);
  const bmps = await Promise.all(photos.map((p) => bitmap(p.kind === 'image' ? p.blob : p.thumb)));
  const meta = categoryMeta(entry.category);

  const infoH = o.format === 'square' ? 360 : 470;
  const photoH = H - M * 2 - infoH;
  if (bmps.length >= 3 && o.format === 'story') {
    const top = photoH * 0.62;
    cover(ctx, bmps[0]!, M, M, W - M * 2, top, 32);
    const hw = (W - M * 2 - 16) / 2;
    cover(ctx, bmps[1]!, M, M + top + 16, hw, photoH - top - 16, 24);
    cover(ctx, bmps[2]!, M + hw + 16, M + top + 16, hw, photoH - top - 16, 24);
  } else if (bmps[0]) cover(ctx, bmps[0], M, M, W - M * 2, photoH, 32);
  else placeholder(ctx, M, M, W - M * 2, photoH, 32, t.line);

  // index chip (only when the card is part of a set)
  if (total > 1) {
    ctx.save();
    ctx.font = `600 22px ${SANS}`;
    const chip = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const cw = ctx.measureText(chip).width + 40;
    roundRect(ctx, M + 28, M + 28, cw, 48, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(chip, M + 48, M + 60);
    ctx.restore();
  }

  let y = M + photoH + 70;
  // category dot + label
  ctx.beginPath();
  ctx.arc(M + 9, y - 8, 9, 0, Math.PI * 2);
  ctx.fillStyle = meta.color;
  ctx.fill();
  label(ctx, `${meta.label} · ${fmtDate(entry.datetime, { weekday: 'short', month: 'short', day: 'numeric' })}`, M + 32, y, t.muted);
  y += 82;
  const name = entry.title || entry.placeName || 'Untitled stop';
  ctx.fillStyle = t.ink;
  const s = fitText(ctx, name, W - M * 2, (z) => `500 ${z}px ${SERIF}`, 78, 44);
  ctx.font = `500 ${s}px ${SERIF}`;
  ctx.fillText(name, M, y);
  y += 26;
  if (entry.placeName && entry.placeName !== name) {
    ctx.fillStyle = t.muted;
    ctx.font = `400 26px ${SANS}`;
    y += 22;
    wrap(ctx, entry.placeName, M, y, W - M * 2, 32, 1);
  }
  y += 42;
  if (entry.rating > 0) stars(ctx, entry.rating, M, y, 36, t.accent, t.line);
  if (o.showCost && entry.cost) {
    ctx.fillStyle = t.ink;
    ctx.font = `500 40px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText(money(entry.cost, trip.currency), W - M, y + 34);
    ctx.textAlign = 'left';
  }
  y += 92;
  const quote = entry.notes || (entry.dishes.length ? entry.dishes.map((d) => d.name).filter(Boolean).join(' · ') : '');
  if (quote && o.format !== 'square') {
    ctx.fillStyle = t.ink;
    ctx.font = `italic 400 32px ${SERIF}`;
    wrap(ctx, `“${quote}”`, M, y, W - M * 2, 44, 2);
  }
  ctx.fillStyle = t.muted;
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText(trip.title, M, H - 56);
  footer(ctx, W, H, t);
  bmps.forEach((b) => b?.close());
  return c;
}

export function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('export failed'))), 'image/png'));
}

export async function shareOrDownload(blobs: { blob: Blob; name: string }[], title: string) {
  const files = blobs.map((b) => new File([b.blob], b.name, { type: b.blob.type || 'image/png' }));
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  for (const { blob, name } of blobs) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'downloaded';
}
