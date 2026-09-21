# Job Edit and Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the job-detail settings panel into a complete admin editor with a protected, recoverable job-delete action.

**Architecture:** A dedicated editor component reuses the existing customer, location, contact, driver, and vehicle controls so edited jobs follow the same data rules as newly created jobs. Firestore transactions re-check the latest job and actor scope, invalidate cached route distance when coordinates change, write an audit event, synchronize active tracking links, and implement deletion as a soft delete that disables tracking and preserves evidence for recovery.

**Tech Stack:** React, Next.js App Router, TypeScript, Firebase Auth/Firestore, existing form components, Node.js tests.

---

### Task 1: Define and test editable job data

**Files:**
- Create: `apps/web/lib/job-edit.ts`
- Create: `tests/job-edit.cjs`
- Modify: `packages/shared/src/index.ts`

1. Write failing tests for converting a job to an edit draft, trimming and validating required fields, trip count, contacts, and dates.
2. Run `node tests/job-edit.cjs` and confirm the missing module failure.
3. Implement the pure draft and validation helpers.
4. Add missing cargo, vehicle-type, and driver identifiers to the shared job type.
5. Run the focused test and confirm it passes.

### Task 2: Add authorized Firestore update and recoverable delete

**Files:**
- Modify: `apps/web/lib/job-detail-repository.ts`
- Modify: `apps/web/lib/transport-repository.ts`
- Modify: `docs/firebase-data-model.md`

1. Add admin-scope helpers aligned with current Firestore rules.
2. Implement transactional detail updates, validate reassigned drivers, clear stale route-distance fields when coordinates change, and append an audit event.
3. Synchronize active tracking-share projections after edits.
4. Implement soft deletion using `deletedAt` metadata, stop tracking, cancel the job, disable public tracking links, and filter deleted jobs from subscriptions.
5. Document editable and soft-delete fields.

### Task 3: Build the admin editor

**Files:**
- Create: `apps/web/app/components/JobEditor.tsx`
- Modify: `apps/web/app/components/JobDetail.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles.css`

1. Replace the three-field settings form with grouped general, pickup, delivery, assignment, schedule, and notes sections.
2. Reuse existing managed-list, saved-location, contact, and approved-driver controls.
3. Add a restrained danger zone with an explicit two-step confirmation and admin-only visibility.
4. Close the detail modal after deletion and let the live subscription select the next available job.
5. Verify responsive layout, labels, focus states, and disabled states.

### Task 4: Verify the complete flow

**Files:**
- Modify: `tests/job-detail.cjs`
- Test: `tests/job-edit.cjs`

1. Test the edit-panel entry point, complete draft submission, delete visibility, and confirmation behavior.
2. Run all repository tests.
3. Run TypeScript checks, lint, and the production web build.
4. Inspect the final diff and ensure no unrelated changes are included.
