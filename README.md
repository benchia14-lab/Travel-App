# Wayfare — premium travel journal

Wayfare tracks everywhere you go on a trip: the places on a map, photos and videos, a food log, attractions and activities, costs and ratings. It turns a trip into a printable journal and into posters sized for Instagram, TikTok and Stories.

It's an installable web app (PWA), so one codebase runs on **iPhone, iPad, Android and laptop**, full-screen and offline.

## Features

| Area | What it does |
| --- | --- |
| **Map & route** | Every stop is pinned, numbered and colour-coded by category. A dotted line joins the stops in order, and the app totals the distance travelled. On desktop the journal has a live map beside it. |
| **Photo geolocation** | **Import photos** reads the GPS position and capture time from each photo's EXIF data, groups photos taken at the same place and time into stops, and looks up the place name. Adding a photo to a stop fills in its location and time. |
| **Location capture** | Search for a place (OpenStreetMap), use your current location, or tap the map. Each place's area (city/town) and country fill in automatically and can be edited. |
| **Food log** | Restaurants with the dishes and drinks you ordered, a price and star rating for each dish, the bill total and a "would go back" flag. |
| **Attractions & activities** | Each one has tickets/costs, ratings, notes and tags. You can sort by date, rating or cost. |
| **Ratings** | A half-star rating for every location and every dish, plus an overall rating for the trip. |
| **Spend** | Total and per-day spend, a budget progress bar, a breakdown by category and by day, and a CSV export. |
| **Print journal** | An A4 layout with a cover, summary, spend table, route map and one page per day. Use **Print / Save PDF**. You can turn photos, costs, the map and notes on or off. |
| **Share studio** | A trip recap poster, or a card for each location, in Post 4:5, Story 9:16 or Square 1:1, with Ivory or Noir themes. You can hide prices. On a phone, **Share** opens the native share sheet so you can post straight to Instagram or TikTok. Tick the places to include, export a single place on its own, or group places by country or area and export one group at a time (its place cards, or a recap of just that area). |
| **Gallery** | Every photo and video from the trip. You can attach items to a stop, set the trip cover or delete items. |
| **Backup** | A single-file export and restore, for moving trips between your phone, iPad and laptop. |

## Free and open

Wayfare has no subscription, paywall or usage limits. Every feature is available to everyone: unlimited trips, photos and videos, the print journal, posters without a watermark, and carousel export.

## Data & privacy

Everything is stored on the device in IndexedDB: trips, stops, and the photos and videos themselves. Photos are resized to 2400 px for display and a 520 px thumbnail is kept. Videos are stored as-is. The only network calls are map tiles (CARTO/OpenStreetMap), place search and reverse geocoding (Nominatim), and Google Fonts.

**iPhone tip:** iOS sometimes removes the location from photos picked in Safari. If an imported photo has no location, choose **Options → Location** in the share sheet, or set the location manually.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

The `dist/` folder works on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Routing is hash-based, so no rewrite rules are needed. HTTPS is required for geolocation and install.

### Stack

React 18, TypeScript and Vite. Leaflet and react-leaflet for maps, Dexie (IndexedDB) for storage and exifr for EXIF/GPS. Posters are drawn on a plain Canvas, so there is no server-side rendering.

### Layout

```
src/
  types.ts            data model (Trip, Entry, Media, categories)
  db.ts               IndexedDB schema
  lib/
    media.ts          EXIF/GPS read, resize, thumbnails, video posters
    geo.ts            search, reverse geocode, distance, photo clustering
    poster.ts         social poster renderer (canvas)
    hooks.ts          live trip data + stats
    backup.ts         export / restore
    sample.ts         demo trip
  components/         map, entry editor, import, lightbox, sheet, …
  pages/              Journeys, Trip, Print, Share studio, Settings
```

## Roadmap ideas

- Accounts and cloud sync, so devices stay in step without backup files
- Multi-currency expenses with FX conversion
- Native wrappers (Capacitor) for App Store and Play Store distribution
- Shared trips with travel companions
