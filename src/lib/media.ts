import exifr from 'exifr';
import { db, uid } from '../db';
import type { Media } from '../types';

export interface ExifInfo {
  lat?: number;
  lng?: number;
  takenAt?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export async function readExif(file: File): Promise<ExifInfo> {
  try {
    const data = await exifr.parse(file, { gps: true, tiff: true, exif: true, pick: undefined });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate;
    return {
      lat: typeof data.latitude === 'number' ? data.latitude : undefined,
      lng: typeof data.longitude === 'number' ? data.longitude : undefined,
      takenAt: date instanceof Date && !isNaN(+date) ? toLocalISO(date) : undefined,
    };
  } catch {
    return {};
  }
}

function canvasToBlob(c: HTMLCanvasElement, q = 0.86): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', q));
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

async function resize(src: CanvasImageSource & { width: number; height: number }, max: number, q = 0.86) {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return { blob: await canvasToBlob(c, q), w, h };
}

async function videoPoster(file: File): Promise<{ thumb: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('video'));
    });
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    await new Promise<void>((res) => (v.onseeked = () => res()));
    const frame = { width: v.videoWidth, height: v.videoHeight } as const;
    const c = document.createElement('canvas');
    const scale = Math.min(1, 480 / Math.max(frame.width, frame.height));
    c.width = Math.round(frame.width * scale);
    c.height = Math.round(frame.height * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return { thumb: await canvasToBlob(c, 0.8), w: frame.width, h: frame.height };
  } catch {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    return { thumb: await canvasToBlob(c), w: 0, h: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Process an uploaded photo/video: read GPS + time, downscale, store. */
export async function ingestFile(file: File, tripId: string, entryId?: string): Promise<Media> {
  const isVideo = file.type.startsWith('video/');
  const exif = isVideo ? {} : await readExif(file);
  let blob: Blob = file;
  let thumb: Blob;
  let width: number | undefined;
  let height: number | undefined;

  if (isVideo) {
    const p = await videoPoster(file);
    thumb = p.thumb;
    width = p.w;
    height = p.h;
  } else {
    const bmp = await loadBitmap(file);
    const big = await resize(bmp, 2400, 0.88);
    const small = await resize(bmp, 520, 0.8);
    blob = big.blob;
    thumb = small.blob;
    width = big.w;
    height = big.h;
    if ('close' in bmp) bmp.close();
  }

  const m: Media = {
    id: uid(),
    tripId,
    entryId,
    kind: isVideo ? 'video' : 'image',
    blob,
    thumb,
    width,
    height,
    lat: exif.lat,
    lng: exif.lng,
    takenAt: exif.takenAt ?? toLocalISO(new Date(file.lastModified || Date.now())),
    fileName: file.name,
    createdAt: Date.now(),
  };
  await db.media.add(m);
  return m;
}

/** Cached object URLs for blobs so lists don't leak URLs. */
const urlCache = new WeakMap<Blob, string>();
export function blobUrl(b: Blob | undefined) {
  if (!b) return undefined;
  let u = urlCache.get(b);
  if (!u) {
    u = URL.createObjectURL(b);
    urlCache.set(b, u);
  }
  return u;
}
