import { db, uid } from '../db';
import type { Category, Dish, Entry, Media, Trip } from '../types';

/** Paints a soft, illustrative "photo" so the demo trip has imagery without bundling assets. */
async function paint(seed: number, palette: [string, string, string], w = 1600, h = 1200): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rnd = (() => {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  })();
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(1, palette[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,240,220,0.85)';
  ctx.beginPath();
  ctx.arc(w * (0.2 + rnd() * 0.6), h * (0.18 + rnd() * 0.2), 70 + rnd() * 60, 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 4; layer++) {
    const base = h * (0.5 + layer * 0.12);
    ctx.fillStyle = palette[2];
    ctx.globalAlpha = 0.35 + layer * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, h);
    let x = 0;
    while (x < w) {
      const bw = 40 + rnd() * 140;
      const bh = 40 + rnd() * (220 - layer * 40);
      ctx.lineTo(x, base - bh);
      ctx.lineTo(x + bw, base - bh);
      x += bw;
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85));
}

async function thumbOf(b: Blob) {
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = Math.round((480 * bmp.height) / bmp.width);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.8));
}

const PAL: Record<string, [string, string, string]> = {
  dusk: ['#F2B880', '#C9705A', '#3B2A3A'],
  sea: ['#9CC9DA', '#E9DCC4', '#2D4F63'],
  tile: ['#E8D3B0', '#D59A6A', '#6B3D2E'],
  night: ['#253248', '#6A5778', '#151824'],
  green: ['#CFE0C3', '#A9C79A', '#2F4A35'],
};

type S = [Category, string, string, number, number, string, number | undefined, number, string, Dish[], keyof typeof PAL, number];

export async function loadSample(): Promise<string> {
  const tripId = uid();
  const trip: Trip = {
    id: tripId,
    title: 'Lisbon & Sintra',
    destination: 'Portugal',
    startDate: '2026-05-14',
    endDate: '2026-05-17',
    currency: 'EUR',
    budget: 1400,
    rating: 4.5,
    notes: 'Long weekend of tiles, tram rides and far too many pastéis de nata.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const S: S[] = [
    ['stay', 'Memmo Alfama', 'Travessa das Merceeiras 27', 38.7112, -9.1310, '2026-05-14T15:00', 540, 4.5, 'Rooftop pool with a view over the river.', [], 'sea', 2],
    ['food', 'Taberna da Rua das Flores', 'Rua das Flores 103', 38.7099, -9.1427, '2026-05-14T20:30', 62, 5, 'No reservations — queue at 7. Worth every minute.', [{ name: 'Peixinhos da horta', price: 7, rating: 4.5 }, { name: 'Octopus, sweet potato', price: 19, rating: 5 }, { name: 'Vinho verde (bottle)', price: 22, rating: 4 }], 'tile', 3],
    ['attraction', 'Tram 28', 'Martim Moniz', 38.7155, -9.1361, '2026-05-15T09:10', 3, 4, 'Board at Martim Moniz early to beat the crowds.', [], 'tile', 2],
    ['attraction', 'Castelo de São Jorge', 'Rua de Santa Cruz do Castelo', 38.7139, -9.1335, '2026-05-15T10:30', 15, 4.5, 'Peacocks, views and shade.', [], 'dusk', 3],
    ['food', 'Manteigaria', 'Rua do Loreto 2', 38.7106, -9.1440, '2026-05-15T13:00', 4.4, 5, 'Best nata in the city. Still warm.', [{ name: 'Pastel de nata ×3', price: 3.6, rating: 5 }, { name: 'Bica', price: 0.8, rating: 4 }], 'tile', 1],
    ['activity', 'Sunset sail on the Tagus', 'Doca de Santo Amaro', 38.7022, -9.1774, '2026-05-15T18:30', 90, 5, 'Under the 25 de Abril bridge at golden hour.', [], 'dusk', 3],
    ['food', 'Cervejaria Ramiro', 'Av. Almirante Reis 1', 38.7206, -9.1355, '2026-05-15T21:30', 78, 4.5, 'Garlic prawns, then a prego for dessert.', [{ name: 'Gambas al ajillo', price: 18, rating: 5 }, { name: 'Clams Bulhão Pato', price: 21, rating: 4.5 }, { name: 'Prego', price: 4, rating: 4 }], 'night', 2],
    ['transport', 'Train to Sintra', 'Rossio Station', 38.7142, -9.1410, '2026-05-16T08:40', 4.6, 3.5, '', [], 'sea', 0],
    ['attraction', 'Palácio da Pena', 'Estrada da Pena', 38.7876, -9.3906, '2026-05-16T10:00', 20, 5, 'Go straight to the terraces before the tour buses.', [], 'green', 3],
    ['attraction', 'Quinta da Regaleira', 'R. Barbosa du Bocage 5', 38.7963, -9.3960, '2026-05-16T13:30', 15, 5, 'The initiation well is unreal.', [], 'green', 2],
    ['shopping', 'A Vida Portuguesa', 'Rua Anchieta 11', 38.7101, -9.1418, '2026-05-17T11:00', 46, 4, 'Soaps, sardine tins and ceramics for home.', [], 'tile', 1],
    ['food', 'Time Out Market', 'Av. 24 de Julho 49', 38.7069, -9.1459, '2026-05-17T13:30', 31, 3.5, 'Busy but great for trying everything.', [{ name: 'Bifana', price: 6, rating: 4 }, { name: 'Ginjinha', price: 2, rating: 4.5 }], 'sea', 1],
  ];

  const entries: Entry[] = [];
  const media: Media[] = [];
  let seed = 1;
  for (const [category, title, placeName, lat, lng, datetime, cost, rating, notes, dishes, pal, nPhotos] of S) {
    const id = uid();
    entries.push({ id, tripId, category, title, placeName, address: `${placeName}, ${lng < -9.3 ? 'Sintra' : 'Lisboa'}, Portugal`, area: lng < -9.3 ? 'Sintra' : 'Lisbon', country: 'Portugal', lat, lng, datetime, cost, rating, notes, dishes, tags: [], wouldReturn: rating >= 4.5, createdAt: Date.now(), updatedAt: Date.now() });
    for (let i = 0; i < nPhotos; i++) {
      const blob = await paint(seed++, PAL[pal]);
      media.push({ id: uid(), tripId, entryId: id, kind: 'image', blob, thumb: await thumbOf(blob), width: 1600, height: 1200, lat, lng, takenAt: datetime, fileName: `${title}-${i + 1}.jpg`, createdAt: Date.now() });
    }
  }
  trip.coverMediaId = media.find((m) => m.fileName.startsWith('Sunset'))?.id ?? media[0]?.id;
  await db.transaction('rw', db.trips, db.entries, db.media, async () => {
    await db.trips.add(trip);
    await db.entries.bulkAdd(entries);
    await db.media.bulkAdd(media);
  });
  return tripId;
}
