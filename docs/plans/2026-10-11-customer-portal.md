# Customer Portal Implementation Plan

**Goal:** Approved customer users can view only their company's active and historical transport jobs in a separate read-only portal.

**Architecture:** Keep the existing customer name field in job forms. Resolve it to the canonical customer document ID at save time and store that ID privately on jobs. Assign the same ID to approved customer accounts. Firestore and Storage rules enforce customer-scoped reads; the portal queries by customer ID and never loads management data.

**Stack:** Next.js, React, Firebase Auth, Firestore, Storage, TypeScript.

## Work

1. Add a customer identity resolver that matches canonical names and aliases, creating a customer record for a new main-company name. Apply it to job creation and edits, and record customer IDs on contacts without changing their forms.
2. Add the customer role and customer ID to user access approval. Validate the selected customer and route approved customers to their own portal.
3. Add a read-only customer portal with active jobs, completed jobs by month, job details, proof images and signatures, and the existing completion report.
4. Restrict Firestore job reads and Storage proof reads to the assigned customer ID. Keep customer accounts outside the main transport organization.
5. Add an admin-only reconciliation path for older jobs and contacts, with ambiguous matches left unlinked. Add a Firestore trigger to link subcontractor-created jobs to known customers, then run targeted checks and typecheck.

**Verification:** Typecheck the web app; run relevant existing tests; inspect the final diff and working-tree status without touching unrelated changes.
