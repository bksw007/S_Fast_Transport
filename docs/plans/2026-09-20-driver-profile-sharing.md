# Driver Profile Sharing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use systematic execution and verification to implement this plan task-by-task.

**Goal:** Give driver records the same expandable media, public web sharing, and printable PDF experience as vehicle records without duplicating personal-profile data.

**Architecture:** Keep the existing `drivers` record as the operational source and the linked `users` profile as the source for profile photo and private documents. Create expiring, denormalized `driver_share_links` snapshots containing only the fields and signed download URLs needed by the public page. Public routes import Firestore only, so they do not initialize Firebase Auth.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Firestore/Storage/Auth, CSS print media.

---

### Task 1: Add driver share data and repository functions

**Files:**
- Modify: `apps/web/lib/resource-repository.ts`
- Create: `apps/web/lib/public-driver-repository.ts`

**Steps:**
1. Define driver document kinds and public-share data types.
2. Add a share-link creator that resolves linked profile photo/documents and assigned vehicle details.
3. Add a public Firestore subscriber that validates and maps the share snapshot.
4. Run TypeScript to verify the new repository contract.

### Task 2: Add the public driver profile and print layout

**Files:**
- Create: `apps/web/app/driver/[token]/page.tsx`
- Create: `apps/web/app/driver/[token]/driver-profile.css`

**Steps:**
1. Build loading, invalid-link, and driver-profile states.
2. Display driver identity, license details, assigned vehicle, photo, and document cards.
3. Add print/PDF behavior with a dynamic title and compact A4 layout.
4. Verify responsive and print styles.

### Task 3: Add sharing and PDF actions to expandable driver cards

**Files:**
- Modify: `apps/web/app/components/ResourceManagementScreens.tsx`
- Modify: `apps/web/app/styles.css`

**Steps:**
1. Convert linked driver documents to the same preview-card pattern used for vehicles.
2. Add share-web and PDF actions to expanded driver cards.
3. Generalize the share dialog for vehicles and drivers.
4. Verify existing vehicle behavior remains unchanged.

### Task 4: Secure and verify public driver links

**Files:**
- Modify: `firebase/firestore.rules`

**Steps:**
1. Add expiring public `get` access and organization-scoped management rules for `driver_share_links`.
2. Run lint, TypeScript, production build, and rule validation.
3. Confirm public driver route does not import the Firebase Auth module.
4. Review the final diff for accidental unrelated changes.
