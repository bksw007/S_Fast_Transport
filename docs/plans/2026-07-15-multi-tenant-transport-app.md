# Multi-tenant Transport App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use systematic implementation and verify each task before continuing.

**Goal:** Adapt S Fast Transport for a main company, subcontract carriers, drivers, and customer tracking links with role-aware navigation and tenant-safe Firebase access.

**Architecture:** Keep the existing Next.js/Expo/Firebase monorepo and add organization metadata to users and jobs. The web app derives navigation from the signed-in profile instead of exposing a manual role switch, while public customer tracking reads a deliberately denormalized share document rather than protected operational data.

**Tech Stack:** Next.js 16, React 18, TypeScript, Firebase Authentication, Firestore, Storage, Expo.

---

### Task 1: Define roles, organizations, and menus

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/lib/transport-repository.ts`

1. Add organization fields to transport jobs.
2. Add main-admin, subcontract-admin, and driver profile metadata.
3. Define grouped navigation for each role.
4. Run `npm run typecheck` and confirm it fails only at consumers that need migration.

### Task 2: Enforce Google-managed access

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/lib/transport-repository.ts`

1. Remove email/password signup and login controls.
2. Create new Google users as pending and inactive.
3. Treat legacy active profiles as approved for migration compatibility.
4. Add a pending-access screen and role-derived application shell.

### Task 3: Build role-aware navigation

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles.css`

1. Render main-company admin navigation with all cross-company sections.
2. Render subcontract-admin navigation without cross-company or system access.
3. Keep driver navigation focused on assigned work and large mobile actions.
4. Add useful overview states for sections whose CRUD workflows are not yet implemented.

### Task 4: Scope Firestore queries and writes

**Files:**
- Modify: `apps/web/lib/transport-repository.ts`
- Modify: `firebase/firestore.rules`
- Modify: `firebase/storage.rules`
- Modify: `firebase/firestore.indexes.json`

1. Query all jobs for main admins, organization jobs for subcontract admins, and assigned jobs for drivers.
2. Write organization identifiers to new jobs, events, and proofs.
3. Restrict reads and writes by role, assigned driver, or matching organization.
4. Keep main-company admins able to manage every organization.

### Task 5: Add customer tracking links

**Files:**
- Create: `apps/web/app/track/[token]/page.tsx`
- Create: `apps/web/app/track/[token]/tracking.css`
- Create: `apps/web/lib/public-tracking-repository.ts`
- Modify: `firebase/firestore.rules`

1. Read a public, expiring `tracking_share_links/{token}` document.
2. Render only customer-safe status, route, ETA, and location fields.
3. Do not expose driver phone numbers, other jobs, internal costs, or tenant data.
4. Show clear invalid, disabled, and expired states.

### Task 6: Update documentation and verify

**Files:**
- Modify: `docs/app-structure.md`
- Modify: `docs/firebase-data-model.md`

1. Document roles, menu visibility, organization isolation, and share-link payloads.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm run build -w @s-fast-transport/web`.
5. Run `git diff --check` and review the final diff.
