# Return-trip distance implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Calculate the return leg with Google Routes and display a trustworthy outward, return, and total distance in job cards, shared tracking, and reports.

**Architecture:** Keep existing outward route-distance fields for compatibility. Store a separate return-leg distance and coordinate fingerprint on the job; derive the total only when both legs have valid distances. Reuse the existing distance endpoint and save transaction with a leg selector, checking coordinates against the saved job for each request. Missing or stale legs must never be presented as a complete total.

**Tech Stack:** Next.js, Firebase/Firestore, Google Routes API, TypeScript, existing Node assert tests.

---

### Task 1: Extend the route-distance contract

**Files:** `packages/shared/src/index.ts`, `apps/web/lib/google-routes-distance.ts` or existing distance helper, `tests/job-road-distance-client.cjs`.

1. Add return-leg distance fields and a shared derived-distance helper with tests for outward-only, complete, and stale return data.
2. Verify the focused test fails before implementation and passes after.

### Task 2: Calculate and persist both legs

**Files:** `apps/web/app/api/maps/distance/route.ts`, `apps/web/lib/job-road-distance-client.ts`, `apps/web/lib/transport-repository.ts`, `apps/web/lib/job-detail-repository.ts`, `tests/job-driver-assignment.cjs`, API and edit tests.

1. Test that the endpoint accepts only coordinates of the requested saved leg and that creation records two distances when return coordinates exist.
2. Reuse the current Routes request for each leg; validate the fingerprint in the save transaction and invalidate return data when return stops change or are removed.
3. Verify creation and edits leave jobs intact if a route service is unavailable.

### Task 3: Show consistent distances

**Files:** `apps/web/app/page.tsx`, `apps/web/app/components/JobDetail.tsx`, `functions-proof/src/public-tracking.ts`, `apps/web/lib/public-tracking-repository.ts`, `apps/web/app/track/[token]/page.tsx`, `apps/web/lib/job-completion-report.ts`, relevant tests.

1. Test complete and incomplete return-leg displays, including older jobs.
2. Show outward, return, and total where both are known; do not label a partial value as total.
3. Run focused tests, web typecheck/lint/build, and functions-proof typecheck; inspect the final diff.
