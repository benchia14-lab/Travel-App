# PYT — Plan Your Travel

PYT (Plan Your Travel) plans and tracks everywhere you go on a trip: the places on a map, photos and videos, a food log, attractions and activities, costs and ratings. It turns a trip into a printable journal and into posters sized for Instagram, TikTok and Stories.

It's an installable web app (PWA), so one codebase runs on **iPhone, iPad, Android and laptop**, full-screen and offline.

## Features

| Area | What it does |
| --- | --- |
| **Trip planner** | A **Plan** tab maps out the trip before you go. Add locations in order and give each one days from the trip's length (e.g. June 11 – July 11 = 31 days), with travel days and transport between them. A bar shows days planned vs free. **Locations** gives the overview; **Day by day** lists every date with its location and stops. Opening a location shows its dates, map, stops, spend and photos, and **Add stop** there creates a stop linked to that location and day. Stops can be *Planned* (with estimated time and cost) or *Done*. |
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

PYT has no subscription, paywall or usage limits. Every feature is available to everyone: unlimited trips, photos and videos, the print journal, posters without a watermark, and carousel export.

## Accounts & data

Everyone signs in with **first name + last name + a 4-digit PIN**. Data is stored in Supabase (project `wayfare`, region ap-southeast-1) and also kept on each device, so the app keeps working offline and syncs in the background. Push and pull happen when you sign in, about 2 seconds after each change, every minute, and when the app comes back into view. If the same item is changed on two devices, the most recent save wins.

- **Database:** `supabase/migrations/20261111000000_wayfare_init.sql` defines `wf_profiles`, `wf_records` (trips, stops, plan locations and photo details as JSON), and the private `wayfare-media` storage bucket for photos and videos.
- **Privacy:** row-level security means each person can only read and write their own records and photos. The admin can *read* everyone's data and reset PINs, but can't change anyone's trips.
- **Admin:** the first account named **Ben Chia** (or Ben Chua) becomes the admin. Create it first.
- **Sign-up:** handled by the `pyt-signup` Edge Function (`supabase/functions/pyt-signup`). It creates the Supabase Auth account directly, because Supabase's public sign-up needs a real email address.
- **Security note:** a 4-digit PIN has only 10,000 combinations. Supabase limits sign-in attempts, but a determined person could still guess a PIN, so keep the admin PIN private.
- The Supabase URL and publishable key are built into the app. They're designed to be public, because the security rules above protect the data. Override them with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.

The app uses OpenStreetMap services for map tiles (CARTO), place search (Nominatim), and Google Fonts.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Deploy (Netlify)

The repo includes `netlify.toml`, so Netlify needs no manual settings.

1. Merge this branch into `main` on GitHub.
2. Sign in at [app.netlify.com](https://app.netlify.com) with GitHub, then choose **Add new site → Import an existing project → GitHub** and pick this repository.
3. Branch to deploy: `main`. Leave the build command and publish directory as detected (`npm run build`, `dist`), then click **Deploy**.
4. After about a minute you get a URL like `https://your-site.netlify.app`. Rename it under **Site configuration → Change site name**, or add your own domain under **Domain management**. HTTPS is turned on automatically.

Every push to `main` redeploys. Pull requests get their own preview URLs.

To use it as an app, open the URL on each device and install it:
- **iPhone / iPad:** in Safari, tap Share → **Add to Home Screen**.
- **Android:** in Chrome, open the ⋮ menu → **Install app**.
- **Mac / PC:** in Chrome or Edge, click the install icon in the address bar.

The built `dist/` folder also works on any other static host (Vercel, Cloudflare Pages, GitHub Pages). Routing is hash-based, so no rewrite rules are needed. HTTPS is required for geolocation and install.

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
