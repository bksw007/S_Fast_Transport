# Driver proof and issue workflow implementation plan

**Goal:** Show one driver action at a time, require two photos and a customer signature at each stop, and let drivers report common problems to admins.

**Architecture:** Keep the job status as the workflow source of truth. Store stop proof metadata on the job and files in the existing `proof_of_delivery` storage path; validate transitions in repository transactions. Use the same issue categories in web and mobile, retaining the current job event and alert mechanism.

**Tech Stack:** Next.js, Expo React Native, Firebase Firestore and Storage, TypeScript.

---

### Task 1: Shared rules and persistence
- Extend issue types and the proof status model in `packages/shared/src/index.ts`.
- Add stop proof upload and signature saving to web and mobile repositories.
- Gate pickup departure and job completion on two photos plus signature, including stale status checks.
- Verify Firestore and Storage rules support the new records.

### Task 2: Web driver flow
- Replace the full action grid in `apps/web/app/page.tsx` with the next action.
- Add a pickup and delivery proof form with two image slots, signature canvas, clear and submit controls.
- Show the next destination after proof is saved, and add an issue shortcut during travel.

### Task 3: Mobile driver flow
- Extend the current step card in `apps/mobile/App.tsx` to keep two photos and a captured signature per stop.
- Upload proof before advancing and prevent advancing on partial or failed uploads.
- Add icon based issue choices and optional note.

### Task 4: Admin visibility and verification
- Label photos and signatures by stop in `apps/web/app/components/JobDetail.tsx`.
- Ensure issue events remain visible in job history and alerts.
- Run TypeScript and lint checks, then inspect the affected mobile layouts.
