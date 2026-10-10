# Admin Driver Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an admin link their existing account to a driver record, assign a job to themselves, and use the existing driver web interface for their own jobs.

**Architecture:** Keep the user's admin role. Accept approved admin accounts in driver assignment, then switch the web shell to the existing driver view when the admin chooses the new menu entry. Scope all driver-view jobs and actions to `assignedDriverUid === profile.uid`; retain admin access and a return control.

**Tech Stack:** Next.js, React, TypeScript, Firebase Firestore.

---

### Task 1: Allow admin accounts as drivers

**Files:** `apps/web/app/components/ResourceManagementScreens.tsx`, `apps/web/app/components/JobEditor.tsx`, `apps/web/app/page.tsx`, `apps/web/lib/transport-repository.ts`, `apps/web/lib/job-detail-repository.ts`.

Update linked-driver choices and assignment validation to accept approved `owner`, `admin`, `dispatcher`, and `subcontract_admin` users in the same organization, while retaining active driver validation.

### Task 2: Reuse the driver interface for admins

**Files:** `apps/web/app/page.tsx`.

Add “แอดมินคนขับ” to the admin navigation and a return control in driver navigation. Reuse `DriverMobileScreen` with only self-assigned jobs, including its existing actions, history, map, proof, and profile screens. Scope default action targets and tracking resume to the signed-in account.

### Task 3: Verify and publish

**Files:** `firebase/firestore.rules` if required by the assigned-driver rules.

Run web TypeScript and lint checks, inspect the diff, commit, and push to `main`.
