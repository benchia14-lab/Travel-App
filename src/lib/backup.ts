import { db } from '../db';
import type { Media } from '../types';

const blobToDataURL = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const dataURLToBlob = async (u: string) => (await fetch(u)).blob();

/** Single-file backup (JSON with embedded media) for moving between devices. */
export async function exportBackup() {
  const [trips, entries, media, legs] = await Promise.all([db.trips.toArray(), db.entries.toArray(), db.media.toArray(), db.legs.toArray()]);
  const parts: BlobPart[] = [`{"app":"wayfare","version":2,"exportedAt":${Date.now()},"trips":${JSON.stringify(trips)},"entries":${JSON.stringify(entries)},"legs":${JSON.stringify(legs)},"media":[`];
  for (let i = 0; i < media.length; i++) {
    const { blob, thumb, ...rest } = media[i];
    parts.push((i ? ',' : '') + JSON.stringify({ ...rest, blob: await blobToDataURL(blob), thumb: await blobToDataURL(thumb) }));
  }
  parts.push(']}');
  const file = new Blob(parts, { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = `wayfare-backup-${new Date().toISOString().slice(0, 10)}.wayfare`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importBackup(file: File): Promise<number> {
  const json = JSON.parse(await file.text());
  if (json.app !== 'wayfare') throw new Error('not a Wayfare backup');
  const media: Media[] = await Promise.all(
    (json.media as (Omit<Media, 'blob' | 'thumb'> & { blob: string; thumb: string })[]).map(async (m) => ({
      ...m,
      blob: await dataURLToBlob(m.blob),
      thumb: await dataURLToBlob(m.thumb),
    })),
  );
  await db.transaction('rw', [db.trips, db.entries, db.media, db.legs], async () => {
    await db.trips.bulkPut(json.trips);
    if (Array.isArray(json.legs)) await db.legs.bulkPut(json.legs);
    await db.entries.bulkPut(json.entries);
    await db.media.bulkPut(media);
  });
  return json.trips.length;
}
