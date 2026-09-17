# Google Maps Location Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow dispatchers to paste a Google Maps share link, name and verify the resolved place, reuse it from a company location library, and expose pickup/delivery navigation links on jobs.

**Architecture:** Add a server-only Next.js endpoint that safely follows approved Google Maps redirects and extracts a display name and coordinates. Store reusable locations in an organization-scoped Firestore subcollection, while copying an immutable location snapshot into each job for backward compatibility with the existing string fields.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Firestore, Node.js tests.

---

### Task 1: Google Maps link resolver

**Files:**
- Create: `apps/web/lib/google-maps-link.ts`
- Create: `apps/web/app/api/maps/resolve/route.ts`
- Create: `tests/google-maps-location.cjs`

1. Write tests for approved domains, long Google Maps URLs, coordinate extraction, display-name cleanup, and rejected URLs.
2. Run `node tests/google-maps-location.cjs` and confirm the missing module/function failure.
3. Implement pure parsing helpers and a server route that follows at most five approved Google redirects.
4. Run the focused test and confirm it passes.

### Task 2: Organization location repository and security rules

**Files:**
- Create: `apps/web/lib/location-repository.ts`
- Modify: `firebase/firestore.rules`
- Modify: `docs/firebase-data-model.md`

1. Define saved-location and job-location snapshot types with validation.
2. Implement subscribe, create/update, and active/inactive operations for `organizations/{organizationId}/locations`.
3. Restrict reads and writes to the same roles already allowed to manage organization lists.
4. Document the new collection and job snapshot fields.

### Task 3: Location picker and location library screen

**Files:**
- Create: `apps/web/app/components/LocationPicker.tsx`
- Create: `apps/web/app/components/LocationManagementScreen.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles.css`
- Modify: `packages/shared/src/index.ts`

1. Add a reusable picker that supports manual names, saved locations, pasted Maps links, preview, and save-to-library.
2. Add the “สถานที่และพิกัด” menu and management screen.
3. Replace pickup/delivery location inputs with the picker while preserving legacy text entry.
4. Add responsive styles and accessible status text.

### Task 4: Persist snapshots and expose navigation

**Files:**
- Modify: `apps/web/lib/transport-repository.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/lib/public-tracking-repository.ts`
- Modify: `apps/web/app/track/[token]/page.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/components/JobDetail.tsx`

1. Add optional pickup/delivery snapshots to drafts and jobs.
2. Copy snapshots into new jobs and public tracking links.
3. Render pickup/delivery navigation actions for drivers, admins, and customers.
4. Keep existing `pickupLocation` and `deliveryLocation` fields as compatibility labels.

### Task 5: Verification

**Files:**
- Test: `tests/google-maps-location.cjs`
- Test: existing `tests/*.cjs`

1. Run the focused resolver test.
2. Run the repository test suite.
3. Run web type checking and linting.
4. Run the production web build and fix any integration failures.
