# Roadmap — Stabilise & Harden pass

- [x] Remove Developer Guide, AI estimate, Global search (+ uninstall packages)
- [x] Master Data: lock icon, exact 3-dot menus, inline edit, mutation states
- [x] RDA: shared query key invalidation
- [x] Calculator: safeNum guard + extra tests
- [x] Security: foods.functions auth + zod + caps; CSV/PDF sanitise
- [x] Migration: isolation indexes; audit_log retention
- [x] Route errorComponent/pendingComponent; debounce filters; lazy jspdf
- [x] Stability additions: structured errors, timeout+retry, error logging
- [x] Two-user verification

# Roadmap — Master Data actions hardening + safe exports
- [x] RowActionsMenu deferred onSelect + row-click guard
- [x] Fix nested `master.$id` route (never rendered — no Outlet) → `master_.$id`
- [x] Clone stays on list, unique "(Copy n)" names, highlight
- [x] RDA key rename ["rda"] + route states
- [x] Exports: ingredient PDF/CSV, master CSV (500 cap), recipes CSV cap, Copy link, PDF retry
- [x] Browser verification + test-data cleanup

# Roadmap — Security hardening + project-centric restructure
- [x] Secrets: `.env*` gitignored, `.env.example` template
- [x] Rate limiting + input validation on the foods lookup endpoint
- [x] DB guards: Default folder cannot be renamed/deleted; locked master items protected
- [x] Every recipe lives in a project folder; orphans backfilled to Default
- [x] Deleting a folder transfers its recipes to Default (confirm dialog states this)
- [x] Navigation is project-first (`/recipes` redirects to `/projects`)
- [x] Builder: starter template insert + memory-only "Reset changes"
- [x] Strict 1-page A4 output for both browser print and PDF download
- [x] Browser verification + test-data cleanup (restored the folder deleted while testing)

# Roadmap — Email/password authentication and recovery
- [ ] Replace Microsoft OAuth with verified email/password signup and sign-in
- [ ] Reconcile server-controlled roles and domain access
- [ ] Convert shared profiles to account-owned selection
- [ ] Attribute activity to selected profiles
- [ ] Enforce admin-only deletes
- [ ] Add administrator-approved recovery flow and emails
- [ ] Verify authentication, authorization, profiles, recovery, and build

# Roadmap — Codes and approvals without a sender domain
- [x] Sign-in code via built-in email OTP; otp_required enforced
- [x] Admin approval via built-in sign-in email linking to the one-tap Approve page
- [x] Removed unused custom email bridge (no sender domain configured)
- [x] Raised auth email hourly limit to 100; build OK
