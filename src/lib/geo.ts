export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function routeKm(points: LatLng[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return d;
}

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
  area?: string;
  country?: string;
}

type NominatimAddress = Record<string, string | undefined>;

function areaOf(a?: NominatimAddress) {
  if (!a) return {};
  return {
    area: a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? a.state,
    country: a.country,
  };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '1' });
  if (near) {
    const d = 0.6;
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const r = await fetch(`${NOMINATIM}/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  const rows: { name?: string; display_name: string; lat: string; lon: string; address?: NominatimAddress }[] = await r.json();
  return rows.map((x) => ({
    name: x.name || x.display_name.split(',')[0],
    address: x.display_name,
    lat: +x.lat,
    lng: +x.lon,
    ...areaOf(x.address),
  }));
}

export async function reverseGeocode(p: LatLng): Promise<Place | null> {
  try {
    const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), format: 'jsonv2', zoom: '18', addressdetails: '1' });
    const r = await fetch(`${NOMINATIM}/reverse?${params}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const x: { name?: string; display_name?: string; address?: NominatimAddress } = await r.json();
    if (!x.display_name) return null;
    return { name: x.name || x.display_name.split(',')[0], address: x.display_name, lat: p.lat, lng: p.lng, ...areaOf(x.address) };
  } catch {
    return null;
  }
}

export function currentPosition(): Promise<LatLng> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocation unavailable'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => rej(e),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

/** Group geotagged media into stops: same place (≤ radius) and close in time. */
export function clusterByPlace<T extends { lat?: number; lng?: number; takenAt?: string }>(
  items: T[],
  radiusKm = 0.15,
  gapHours = 3,
): T[][] {
  const sorted = [...items].sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''));
  const groups: T[][] = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    const ref = last?.[last.length - 1];
    const near =
      ref &&
      ref.lat != null &&
      it.lat != null &&
      haversineKm({ lat: ref.lat, lng: ref.lng! }, { lat: it.lat, lng: it.lng! }) <= radiusKm;
    const soon =
      ref?.takenAt && it.takenAt
        ? Math.abs(+new Date(it.takenAt) - +new Date(ref.takenAt)) / 36e5 <= gapHours
        : false;
    if (last && near && soon) last.push(it);
    else groups.push([it]);
  }
  return groups;
}

export type GroupBy = 'none' | 'country' | 'area';

/** The country / area a place belongs to, falling back to its address text. */
export function groupKey(e: { area?: string; country?: string; address?: string }, by: GroupBy) {
  const parts = (e.address ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const country = e.country?.trim() || (parts.length > 1 ? parts[parts.length - 1] : '');
  if (by === 'country') return country || 'Other places';
  if (by === 'area') {
    const area = e.area?.trim();
    if (area) return country ? `${area}, ${country}` : area;
    return country ? `Elsewhere in ${country}` : 'Other places';
  }
  return '';
}
