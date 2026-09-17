# Stable Map Location Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make “ตั้งค่าพิกัดแผนที่” a visible transport-work menu and ensure each job location selection atomically changes its name, Maps link, coordinates, and identifiers.

**Architecture:** Keep `organizations/{organizationId}/locations` as the only reusable map-location collection. The job form will stop mixing generic text list options with saved map records; it will use a native saved-location select plus a separate per-job display label, copying the selected record into the job snapshot.

**Tech Stack:** React, TypeScript, Next.js App Router, Firebase Firestore, Node.js tests.

---

### Task 1: Reproduce and lock the regressions

**Files:**
- Create: `tests/map-location-settings.cjs`
- Modify: `tests/sidebar.cjs`

1. Assert the map-settings item is rendered inside the transport-work group.
2. Assert the location picker no longer depends on the generic `ListManagerComboBox`.
3. Assert selecting different collection records produces different complete job snapshots.
4. Run the focused tests and confirm they fail before implementation.

### Task 2: Make the collection the single source of truth

**Files:**
- Modify: `apps/web/app/components/LocationPicker.tsx`
- Modify: `apps/web/lib/location-repository.ts`
- Modify: `apps/web/app/page.tsx`

1. Add a pure saved-location selection helper.
2. Replace the generic location name dropdown with a native select backed only by saved-location records.
3. Keep a separate editable job display-name input without changing the selected coordinates.
4. Add an explicit clear-map action that removes the complete location snapshot.

### Task 3: Put settings in the requested navigation group

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/components/LocationManagementScreen.tsx`

1. Rename the menu and screen to “ตั้งค่าพิกัดแผนที่”.
2. Include it in the “งานขนส่ง” navigation group.
3. Keep collection management for links, names, coordinates, instructions, status, and edit actions.

### Task 4: Verify behavior and regressions

**Files:**
- Test: `tests/map-location-settings.cjs`
- Test: `tests/*.cjs`

1. Run focused tests.
2. Run all repository tests, lint, and workspace type checks.
3. Build the production web app.
4. Verify the rendered navigation and job form in a browser without runtime errors.
