# Driver Expenses Implementation Plan

**Goal:** Replace the unused driver proof update menu with job-linked expense claims and monthly totals, and give transport admins a review queue.

**Architecture:** Store one claim per completed job and assigned driver in `driver_expenses`, using a deterministic document ID. Store receipt images in a separate private Storage path. Driver mode and admin-driver mode share the same claim screen; an admin screen reviews claims. Existing completed-job subscription supplies eligible jobs, and claim subscription supplies amounts and status.

**Tech Stack:** Next.js/React, Firebase Firestore Standard (default database in `asia-southeast1`), Firebase Storage, existing image compression.

## Tasks

1. Add a claim repository with validated amount, receipt upload, deterministic job/driver identity, subscriptions, and admin review transitions.
2. Add Firestore and Storage rules for job ownership, completed status, admin review, private receipts, and document shape.
3. Replace the driver proof menu with a mobile-friendly expense screen: monthly badges, completed jobs, claim form, receipts, status, and totals.
4. Add the admin review menu and claim list with pending/approved/rejected/paid actions and receipt previews.
5. Verify access rules, typecheck, lint, build, and inspect responsive layouts. Leave deployment for a separate authorized step.
