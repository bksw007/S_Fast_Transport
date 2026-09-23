# Driver Step Check-in Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the mobile driver job screen into a gated, one-step-at-a-time check-in flow with pickup/delivery photos and structured issue reporting.

**Architecture:** Keep workflow decisions in a small pure helper so the UI renders only the current action and tests can verify every status transition. Store check-in photos in Firebase Storage under the existing proof path, record their metadata in `job_events`, and record issue reports as events plus an alert/status update on the assigned job.

**Tech Stack:** Expo 52, React Native, TypeScript, Expo Image Picker, Firebase Firestore and Storage, Node assertion tests.

---

### Task 1: Define and test the gated workflow

**Files:**
- Create: `apps/mobile/src/driver-workflow.ts`
- Create: `tests/mobile-driver-workflow.cjs`

**Step 1: Write the failing test**

Cover every job status and assert that exactly one next step is returned, pickup and delivery arrival steps require photos, terminal states return no step, and problem status can resume from stored workflow metadata.

**Step 2: Run test to verify it fails**

Run: `node tests/mobile-driver-workflow.cjs`
Expected: FAIL because the workflow module does not exist.

**Step 3: Write minimal implementation**

Create typed step definitions and `currentDriverStep(job)` / `driverProgress(job)` helpers without UI or Firebase dependencies.

**Step 4: Run test to verify it passes**

Run: `node tests/mobile-driver-workflow.cjs`
Expected: PASS.

### Task 2: Add photo and issue persistence

**Files:**
- Modify: `apps/mobile/src/transport-repository.ts`
- Modify: `apps/mobile/src/firebase.ts`
- Modify: `firebase/firestore.rules`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`

**Step 1: Add Expo image access**

Install the Expo-compatible `expo-image-picker` package and add camera/photo permission descriptions.

**Step 2: Implement check-in photo upload**

Upload JPEG/PNG/WEBP files below 1 MB to `proof_of_delivery/{jobId}/{uid}/`, then create a `job_events` record containing stage, download URL, storage path, actor, and location.

**Step 3: Implement issue reporting**

Write an issue event containing one of `accident`, `traffic`, or `contact_failed`, optional notes, current location, and the previous job status. Update the job to `problem` while preserving enough metadata for the driver to resume the interrupted step.

**Step 4: Update Firestore rules**

Allow assigned drivers to change only the new issue-related fields alongside the existing status and tracking fields.

### Task 3: Build the mobile step-by-step interface

**Files:**
- Modify: `apps/mobile/App.tsx`

**Step 1: Replace the full action grid**

Render a progress header, completed-step summary, and one prominent current-step action. Do not render future steps.

**Step 2: Add required photo check-in**

For pickup and delivery arrival, let the driver take a photo or select one, show a preview, and keep the continue button disabled until upload succeeds.

**Step 3: Add issue report sheet**

Add a persistent report-problem button, three large icon choices, an optional multiline note, cancel, and submit controls.

**Step 4: Add loading and success feedback**

Prevent duplicate actions while uploading/submitting and show clear Thai feedback after each operation.

### Task 4: Verify the complete change

**Files:**
- Test: `tests/mobile-driver-workflow.cjs`
- Test: `tests/report-status-recording.cjs`

**Step 1: Run focused tests**

Run: `node tests/mobile-driver-workflow.cjs && node tests/report-status-recording.cjs`
Expected: PASS.

**Step 2: Run type checks**

Run: `npm run typecheck`
Expected: all workspaces compile without errors.

**Step 3: Review the mobile flow**

Confirm only the current step is visible, photos are required at both locations, issue reporting remains available throughout active work, and terminal jobs expose no further action.
