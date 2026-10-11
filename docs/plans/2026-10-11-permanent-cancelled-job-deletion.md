# Permanent Cancelled Job Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authorized admins permanently erase each cancelled job from the Dashboard, including its linked evidence and tracking data.

**Architecture:** Use a callable Firebase Cloud Function to recheck account access and cancellation status server-side. Delete private storage objects and related Firestore records, then delete the job last. Add a two-step per-card confirmation to the cancelled tab.

**Tech Stack:** React, Next.js, Firebase Cloud Functions, Firestore, Cloud Storage.

---

### Task 1: Server deletion

**Files:** `functions-proof/src/index.ts`, `functions-proof/src/permanent-job-deletion.ts`.

Validate admin role, organization ownership, and cancelled state. Remove tracking links, proofs, events, notifications, location points, storage files, and the job. Keep the operation retryable and return a clear failure.

### Task 2: Dashboard action

**Files:** `apps/web/app/components/AdminDashboard.tsx`, `apps/web/app/page.tsx`, `apps/web/lib/job-detail-repository.ts`, `apps/web/app/styles.css`.

Show a permanent-delete button only in the cancelled tab for administrators. Require explicit confirmation naming the work order, disable duplicate requests, and show success/error feedback.

### Task 3: Verify and release

**Files:** `tests/dashboard.cjs`, `tests/permanent-job-deletion.cjs`.

Test authorization and cleanup selection, UI confirmation, web and functions typechecks, lint, and build. Deploy the function, commit, and push main.
