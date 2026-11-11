import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Entry, Media } from '../types';
import { categoryMeta } from '../types';
import { useColorScheme } from '../lib/useColorScheme';

const TILE = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function pinIcon(n: number | string, color: string, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${active ? 'pin--active' : ''}" style="--c:${color}"><span>${n}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    tooltipAnchor: [0, -38],
  });
}

const photoIcon = L.divIcon({ className: '', html: '<div class="photo-dot"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });

function Fit({ points, padding = 48 }: { points: [number, number][]; padding?: number }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  const fit = () => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], animate: false, maxZoom: 15 });
  };
  useEffect(fit, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // the container may be laid out after mount (sticky panes, sheets, tabs)
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      fit();
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function TripMap({
  entries,
  media = [],
  activeId,
  onSelect,
  onPick,
  className = '',
  showRoute = true,
  interactive = true,
  colorFor,
}: {
  entries: Entry[];
  media?: Media[];
  activeId?: string;
  onSelect?: (e: Entry) => void;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  showRoute?: boolean;
  interactive?: boolean;
  /** Override pin colours (defaults to the stop's category colour). */
  colorFor?: (e: Entry) => string;
}) {
  const scheme = useColorScheme();
  const located = useMemo(() => entries.filter((e) => e.lat != null && e.lng != null), [entries]);
  const route = located.map((e) => [e.lat!, e.lng!] as [number, number]);
  const loosePhotos = media.filter((m) => !m.entryId && m.lat != null);
  const fitPts = route.length ? route : loosePhotos.map((m) => [m.lat!, m.lng!] as [number, number]);

  return (
    <MapContainer
      className={`map ${className}`}
      center={fitPts[0] ?? [30, 0]}
      zoom={fitPts.length ? 13 : 2}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      attributionControl
      worldCopyJump
    >
      <TileLayer key={scheme} url={TILE[scheme]} attribution={ATTR} subdomains="abcd" maxZoom={20} crossOrigin />
      <Fit points={fitPts} />
      {onPick && <ClickPicker onPick={onPick} />}
      {showRoute && route.length > 1 && (
        <>
          <Polyline positions={route} pathOptions={{ color: scheme === 'dark' ? '#1a1916' : '#ffffff', weight: 7, opacity: 0.9 }} />
          <Polyline positions={route} pathOptions={{ color: scheme === 'dark' ? '#d49a5c' : '#a8662f', weight: 3, dashArray: '1 8', lineCap: 'round' }} />
        </>
      )}
      {loosePhotos.map((m) => (
        <Marker key={m.id} position={[m.lat!, m.lng!]} icon={photoIcon} />
      ))}
      {located.map((e, i) => (
        <Marker
          key={e.id}
          position={[e.lat!, e.lng!]}
          icon={pinIcon(i + 1, colorFor?.(e) ?? categoryMeta(e.category).color, e.id === activeId)}
          zIndexOffset={e.id === activeId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(e) }}
        >
          <Tooltip direction="top">{e.title || e.placeName}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
