# Google Routes Distance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the actual Google road distance between each job's saved pickup and delivery coordinates while minimizing paid API requests.

**Architecture:** A server-only Next.js endpoint calls Compute Routes with basic driving features and no traffic data. The client reuses a distance stored on the job when its coordinate fingerprint still matches, requests Google only when needed, saves a successful result for future views, and falls back to the existing straight-line estimate when Google is unavailable.

**Tech Stack:** Next.js App Router, React, TypeScript, Google Maps Routes API, Firebase Firestore, Node.js tests.

---

### Task 1: Test the server route contract

**Files:**
- Create: `tests/google-routes-distance.cjs`
- Create: `apps/web/lib/google-routes-distance.ts`
- Create: `apps/web/app/api/maps/distance/route.ts`

1. Write failing tests for coordinate validation, the traffic-unaware Google request, field masking, and response parsing.
2. Run `node tests/google-routes-distance.cjs` and confirm the missing module failure.
3. Implement the minimal server helper and POST route.
4. Run the focused test and confirm it passes.

### Task 2: Persist and reuse a coordinate-bound result

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/lib/transport-repository.ts`
- Modify: `apps/web/lib/job-detail-repository.ts`
- Modify: `tests/job-detail.cjs`

1. Add a failing test for cached-distance matching and stale-coordinate rejection.
2. Add optional route-distance fields to the shared job model and Firestore mapper.
3. Add an authorized transaction that saves distance only when the current pickup and delivery coordinates still match.
4. Run the focused tests and confirm they pass.

### Task 3: Display actual distance with a safe fallback

**Files:**
- Modify: `apps/web/app/components/JobDetail.tsx`
- Modify: `apps/web/app/styles.css`
- Modify: `tests/job-detail.cjs`

1. Reuse a valid saved Google distance without calling the API.
2. Deduplicate simultaneous browser requests and fetch only when no valid saved result exists.
3. Show a compact loading state, then label Google results as road distance; use the straight-line approximation only on unavailable/error responses.
4. Keep the responsive heading layout accessible and visually consistent.

### Task 4: Document configuration and verify

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `README.md`

1. Document the server-only `GOOGLE_MAPS_ROUTES_API_KEY`, Routes API enablement, caching behavior, and recommended quota cap.
2. Run focused tests, the full test suite, type checking, linting, and the production web build.
3. Inspect the final diff and confirm no unrelated user changes were overwritten.
