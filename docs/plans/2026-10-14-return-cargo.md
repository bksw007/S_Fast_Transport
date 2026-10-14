# Return Cargo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow an admin to mark a job as carrying cargo back, with two sequential legs in one work order and separate schedules, stops, proof, and progress.

**Architecture:** Keep the existing job document and outward-leg fields for compatibility. Add a return-leg object and active-leg marker; a shared route helper identifies the active stop and proof. The driver completes four proof stages before closing a return job. Customer, admin, and reports show both legs together.

**Tech Stack:** Next.js, React, TypeScript, Firebase Firestore and Storage rules.

---

### Task 1: Model and validation

**Files:** `packages/shared/src/index.ts`, `apps/web/lib/job-edit.ts`, `apps/web/lib/transport-repository.ts`, `apps/web/lib/job-detail-repository.ts`

1. Add return-leg stop/schedule fields, two proof fields, and active-leg marker to the job type.
2. Validate return pickup/delivery and chronology when enabled.
3. Save and load return data on create/edit without changing `tripCount`.
4. Run typecheck.

### Task 2: Admin create and edit UI

**Files:** `apps/web/app/page.tsx`, `apps/web/app/components/JobEditor.tsx`, matching CSS

1. Add the “รับสินค้ากลับ” checkbox.
2. Reveal return stops, prefilled in reverse order, with editable dates, times, and contacts.
3. Ensure existing jobs remain editable.

### Task 3: Driver sequence and proof

**Files:** `apps/web/lib/transport-repository.ts`, `apps/web/app/page.tsx`, `firebase/firestore.rules`

1. Switch to the return leg only after outward delivery proof is saved.
2. Capture distinct return pickup and return delivery photos/signatures.
3. Complete only after return delivery proof; show active return stops and progress.
4. Validate rules and build.

### Task 4: Visibility and report

**Files:** `apps/web/app/components/JobDetail.tsx`, `apps/web/app/components/CustomerPortal.tsx`, `apps/web/lib/job-completion-report.ts`, `apps/web/app/components/ReportsScreen.tsx`, public tracking UI if needed

1. Display both legs and their evidence in one job detail and one report.
2. Check responsive layout and existing one-way jobs.
3. Run focused tests, lint, typecheck, build, and Firebase rules dry run.
4. Commit and push to `main`; deploy rules required for driver uploads.
