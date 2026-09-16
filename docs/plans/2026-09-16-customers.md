# Customer Management Implementation Plan

**Goal:** Replace the customer demo with persisted customer records, customer job lookup, and tracking-link management.
**Architecture:** Reuse authenticated Firestore repositories and the existing tracking route. Match legacy job customer names without modifying historical jobs; retain aliases when renaming customers. Restrict customer management to main-company admins.
**Tech Stack:** Next.js, React, TypeScript, Firebase.

1. Add customer repository with validated records, name uniqueness transactions, aliases, and list-option integration.
2. Add customer screen with four working sections, search, edit, archive/reactivate, job filters, link creation, copy, expiry editing, and revocation.
3. Extend existing tracking creation with configurable expiry; permit authorized management reads and prevent public enumeration. Ensure open tracking pages expire.
4. Run TypeScript, lint, build, and focused verification. Preserve existing workspace edits.

## Verification and release
- Web TypeScript and ESLint pass.
- Production build passes.
- `node tests/customer-tracking.cjs` covers active links, revoked links, expired links, expiry while the page stays open, and listener/timer cleanup.
- Customer job lookup includes completed jobs from `today_jobs`; no sample jobs are supplied to this screen.
- Publish the web app and the updated Firestore rules together. The `customer_names` collection needs the included main-company admin rules; link management needs authorized list access.
- Live signed-in CRUD and Firestore rule emulator tests have not been run. No production records were changed and no deployment was performed.

## Production release — 2026-09-16
- User explicitly authorized production publication.
- Vercel production deployment `dpl_EFVViW5JhYQ441MtMFwKYRjC4am2` is Ready; production alias resolves to this deployment: https://sfasttransport-vorrapats-projects.vercel.app
- Firestore rules compiled and released successfully to `fir-fast-transport` using `firebase deploy --only firestore:rules`.
- Production environment entries are sensitive and cannot be read back; empty pull values are not evidence that the server values are unset. Existing production environment settings were preserved.
- Signed-in production CRUD was not exercised. No customer records were created or edited during publication.
