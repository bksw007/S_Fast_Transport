# S Fast Transport

Mobile-first transport operations platform for job-based live tracking, proof of delivery, driver workflows, and customer tracking links.

## Apps

- `apps/mobile`: React Native + Expo driver/admin mobile shell
- `apps/web`: Next.js PWA/admin web console
- `packages/shared`: shared statuses, sample data, and domain types
- `firebase`: Firestore rules, indexes, and seed/schema notes

## Run

```bash
npm install
npm run dev:web
npm run dev:mobile
```

## Environment

Web app env in `apps/web/.env.local` and Vercel:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Enable these Google Maps APIs for the key:

- Maps JavaScript API
- Geocoding API, if pickup/delivery address lookup is added later
- Directions API, if route lines/ETA from Google are added later

## Core Model

Tracking is tied to a job/work order, not only a driver. The latest location lives on `today_jobs/{jobId}.currentLocation` for fast dashboards, while detailed route history is written under `job_locations/{jobId}/points`.
