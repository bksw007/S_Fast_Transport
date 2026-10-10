# Per-Job Completion PDF Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins create a customer-facing completion PDF for each finished job using a reusable layout.

**Architecture:** Add a dedicated completed-job section in Reports. Resolve the job's existing pickup and delivery proof images and signatures from Firebase Storage, then populate a reusable print-ready HTML template. Browser print preview provides Save as PDF without a server rendering dependency.

**Tech Stack:** Next.js, React, TypeScript, Firebase Storage, browser print/PDF.

---

### Task 1: Define report data and template

**Files:** `apps/web/lib/job-completion-report.ts`.

Build an escaped Thai A4 template with job summary, vehicle and driver, schedule and actual timestamps, pickup/delivery proof galleries, signatures, missing-data labels, page breaks, and print button.

### Task 2: Add report UI

**Files:** `apps/web/app/components/ReportsScreen.tsx`, `apps/web/app/styles.css`.

Add a per-job report tab listing only completed jobs. Resolve all proof URLs, show errors if evidence cannot load, then open the reusable preview and print flow.

### Task 3: Verify and publish

**Files:** `tests/job-completion-report.cjs`.

Test escaped content, completed-only selection, evidence image rendering, and missing-data output. Run TypeScript, lint, build, and related tests; commit and push to main.
