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
GOOGLE_MAPS_ROUTES_API_KEY=
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
```

Enable these Google Maps APIs for the key:

- Maps JavaScript API
- Geocoding API, if pickup/delivery address lookup is added later
- Routes API, for road distance between a job's pickup and delivery points

Keep `GOOGLE_MAPS_ROUTES_API_KEY` server-only and restrict it to the Routes API.
The job detail modal requests basic `DRIVE` routing with `TRAFFIC_UNAWARE`, asks
Google only for `distanceMeters`, and saves the successful result on the job.
Later views reuse that value while the pickup and delivery coordinates remain the
same. Simultaneous and failed requests are also suppressed within the browser
session; when Routes is unavailable, the UI falls back to a straight-line estimate.

Google currently includes 10,000 monthly Compute Routes Essentials requests at no
charge. For cost control, set a Routes API quota in Google Cloud appropriate to the
operation (for example, 300 requests/day stays near 9,000 requests in a 30-day
month). Quota exhaustion does not block job details; it only activates the
straight-line fallback.

The Expo mobile project is currently parked. Its source remains in `apps/mobile`,
but new driver features are implemented in the PWA under `apps/web`.

## PWA location and stale-location alerts

When a driver presses **เริ่มแชร์ตำแหน่ง**, the PWA requests notification and
foreground location permission, records the first position, then keeps a
five-minute foreground heartbeat. If the browser freezes the PWA while Google
Maps is open, the server-side scheduler detects that no position has arrived for
20 minutes and sends a Web Push notification asking the driver to reopen the app.

iPhone drivers must add the site to the Home Screen before Web Push is available.
GPS resumes when the driver opens the PWA; a PWA cannot read the position being
used internally by Google Maps.

Generate one VAPID key pair and use the same public key in the web app and Cloud
Functions:

```bash
npx web-push generate-vapid-keys
firebase functions:secrets:set WEB_PUSH_VAPID_PUBLIC_KEY
firebase functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY
firebase deploy --only functions:monitorStaleDriverLocations,firestore:rules
```

Set `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` in `apps/web/.env.local` and the web
hosting environment. Deploying scheduled Cloud Functions requires a Firebase
project on the Blaze plan. The function runs every five minutes and repeats a
stale-location alert at most once per hour until the GPS recovers.

Driver mobile env in `apps/mobile/.env` (parked):

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

Background GPS requires an Expo development/production build; Expo Go cannot run
background location reliably. The driver signs in with the approved Google account,
presses **เริ่มแชร์ตำแหน่ง**, and may then switch to Google Maps for navigation.
Android keeps a visible tracking notification while the job is active.

For the first Android build, obtain the SHA-1 fingerprint from the signing key,
add it to the Android app `com.sfasttransport.app` in Firebase, download the
generated Android OAuth client ID, and set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.
This step is required before Google login can be tested on an Android device.

## Core Model

Tracking is tied to a job/work order, not only a driver. The latest location lives on `today_jobs/{jobId}.currentLocation` for fast dashboards, while detailed route history is written under `job_locations/{jobId}/points`.

## Reports

The Reports menu now contains working punctuality, job-status, resource-performance, and export views on desktop and mobile. It uses the existing authorized `today_jobs` subscription, including completed and cancelled jobs. The default period is the current month in Bangkok time; select all dates to include legacy jobs without `jobDate`.

- Filter by job date, company, customer, job status, or job/driver/vehicle/route text. Detail tables show 25 jobs per page; exports include every matching job.
- On-time delivery compares `arrivedDeliveryAt` with `deliveryDate` + `deliveryTime` in Asia/Bangkok. The denominator contains only non-cancelled jobs with both timestamps. Missing schedules or missing historical arrival times are reported as unassessable; GPS updates and completion times are not substituted for arrival.
- Active jobs past their scheduled arrival are reported separately as overdue. Resource summaries cover vehicles, drivers, companies, and customers; trip totals are based on job records, not GPS-derived trips or utilization.
- Excel export is a real `.xlsx` file with six sheets (overview, detail, vehicles, drivers, companies, customers). PDF export opens a separate print report; choose Save as PDF in the browser print dialog. Pop-ups must be allowed.
- Both web and native driver status writers preserve the first server-recorded arrival/completion timestamp in a transaction. Existing historical jobs are not backfilled. Deploy the web app, updated native app, and `firebase/firestore.rules` together when releasing; old native versions do not write these timestamps.

Validation commands:

```sh
node tests/reports.cjs
node tests/report-status-recording.cjs
node tests/reports-navigation.cjs
npm run typecheck
npm run lint
npm run build -w @s-fast-transport/web
```

Report browser verification used isolated fixture data (31 jobs), tested pagination and filtering, read back the downloaded six-sheet workbook, and verified the filtered print report and mobile width. No production records were modified during those checks.
