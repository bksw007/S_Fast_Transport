# Customer Job Requests Implementation Plan

**Goal:** Let approved customers request transport, let main-company staff decide, and notify the selected email recipients and the main company.

**Architecture:** Keep requests separate from transport jobs. An authenticated server function creates a request and writes each new place into both the customer's private location library and the main company's location library. Main-company staff prefill the existing dispatch form from a request; the existing job creation transaction marks it accepted only after the job is saved. A server trigger sends request and decision emails and records successful delivery so ordinary retries do not resend them.

**Tech Stack:** Next.js, React, Google Maps JavaScript API, Firebase Authentication, Firestore, Firebase Functions, Gmail SMTP through Nodemailer.

---

### Task 1: Data and access

**Files:** `apps/web/lib/customer-job-requests.ts`, `firebase/firestore.rules`.

1. Define request statuses, place snapshots, recipients, requester, decision and linked job fields.
2. Add scoped Firestore reads for customers and main-company staff; allow only staff to update decisions.
3. Add request subscriptions for both screens and validation helpers.
4. Verify customer A cannot read customer B's requests and cannot write admin location records.

### Task 2: Submission and paired locations

**Files:** `functions-customer/src/index.ts`, `apps/web/app/components/CustomerJobRequests.tsx`, `apps/web/app/components/CustomerMapPicker.tsx`, `apps/web/app/components/customer-portal.css`.

1. Build a map picker with search/marker selection and a saved customer-place list.
2. Validate dates, places, cargo, vehicle and 1–3 selected customer email recipients.
3. Make a callable function validate the authenticated customer, deduplicate places and create customer/private plus main-company location records when new.
4. Create the pending request with immutable place snapshots and recipient list.

### Task 3: Admin review and dispatch

**Files:** `apps/web/app/page.tsx`, `apps/web/app/components/CustomerRequestInbox.tsx`, `apps/web/lib/transport-repository.ts`.

1. Split notifications into driver and customer tabs with pending counts.
2. Show request details and a reason-required reject action.
3. On acceptance, open the existing dispatch form with matching fields prefilled.
4. In the job creation transaction, atomically create the job and mark the pending request accepted with its job ID and work order.
5. Keep the request pending if staff leaves the dispatch form without saving.

### Task 4: Email and release

**Files:** `functions-customer/src/index.ts`, `README.md`.

1. Send submission and final-decision email to the selected customer recipients plus the main-company email.
2. Use Firebase secrets for the Gmail address and app password; log successful deliveries to avoid duplicate sends during retries.
3. Run targeted tests, lint, typechecks and build; deploy Firestore rules/functions and release the web app after the required email settings are configured.
