# Driver Expanded Job Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the expanded driver job card into a practical pickup/delivery itinerary with navigation, scheduled times, phase-aware contacts, approximate distance, and issue reporting.

**Architecture:** Keep display decisions in pure helper functions inside the web screen so job status determines which contact is revealed and how distance/time are formatted. Persist driver issues through the existing Firestore job and event collections, using the already-deployed assigned-driver rule fields, and render issue input as a mobile bottom sheet owned by the selected card.

**Tech Stack:** Next.js 16, React 19, TypeScript, Lucide icons, Firebase Firestore, CSS, Node assertion tests.

---

### Task 1: Define itinerary and contact behavior

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `tests/driver-today-actions.cjs`

**Step 1: Write failing helper tests**

Assert that pre-pickup statuses reveal only the pickup contact, delivery-bound statuses reveal only the delivery contact, problem status follows `issuePreviousStatus`, and terminal/cancelled states do not leak a future contact.

**Step 2: Run the focused test**

Run: `node tests/driver-today-actions.cjs`
Expected: FAIL because itinerary/contact helpers and stop cards are not implemented.

**Step 3: Implement pure helpers**

Add helpers for effective status, active stop, Thai schedule display, safe navigation fallback URL, and approximate route distance display.

**Step 4: Render pickup and delivery stop cards**

Replace ETA, last-updated, and alert metrics with two stop cards containing location, scheduled date/time, map button, and only the phase-appropriate contact phone.

### Task 2: Persist driver issue reports

**Files:**
- Modify: `apps/web/lib/transport-repository.ts`
- Modify: `apps/web/app/page.tsx`
- Test: `tests/driver-issue-report.cjs`

**Step 1: Write a failing repository test**

Verify that issue reporting changes the job to `problem`, preserves the prior workflow status, appends a readable alert, and writes a `driver_issue` event with type and note.

**Step 2: Implement the transaction**

Add `reportDriverIssue(job, issueType, note, actor)` with note trimming, a bounded alert history, current location, and organization metadata.

**Step 3: Restore workflow after the next action**

When updating a job currently in `problem`, remove transient issue fields while retaining the event/alert history.

### Task 3: Build the mobile issue-report sheet

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/app/theme.css`

**Step 1: Add the report button**

Place a warning-styled “แจ้งปัญหา” action beside the current job step without competing with the primary workflow button.

**Step 2: Add issue choices**

Render icon choices for accident, traffic congestion, and customer contact failure, plus an optional 500-character detail field.

**Step 3: Add submit feedback**

Disable duplicate submits, close on success, and surface repository errors through the existing application status message.

### Task 4: Verify behavior and responsive layout

**Files:**
- Test: `tests/driver-today-actions.cjs`
- Test: `tests/driver-issue-report.cjs`

**Step 1: Run focused tests**

Run: `node tests/driver-today-actions.cjs && node tests/driver-issue-report.cjs`
Expected: PASS.

**Step 2: Run project checks**

Run: `npm run typecheck && npm run lint && npm run build -w @s-fast-transport/web`
Expected: all checks pass.

**Step 3: Inspect at phone width**

Verify at 390px that both stops, map actions, distance, current contact, issue action, and next-step action remain readable without horizontal overflow.
