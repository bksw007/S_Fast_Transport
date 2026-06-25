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

## Core Model

Tracking is tied to a job/work order, not only a driver. The latest location lives on `today_jobs/{jobId}.currentLocation` for fast dashboards, while detailed route history is written under `job_locations/{jobId}/points`.
